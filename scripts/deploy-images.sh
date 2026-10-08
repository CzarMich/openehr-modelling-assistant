#!/usr/bin/env bash
set -euo pipefail
environment=${1:?development or production required}
revision=${2:?full source revision required}
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || exit 2
case "$environment" in
  development) state_dir=/opt/hygeoniq/projects/openehr-modelling-assistant; project=openehr-modelling-dev; origin=https://dev-openehr-modelling.sandbox.hygeoniq.com ;;
  production) state_dir=/opt/openehr-modelling-assistant; project=openehr-modelling-assistant; origin=https://openehr-modelling.sandbox.hygeoniq.com ;;
  *) exit 2 ;;
esac
config="$state_dir/config"
test "$(cat "$config/deploy-environment")" = "$environment"
test -r "$config/runtime.env"
incoming="$state_dir/incoming/$revision"
test -r "$incoming.tar.gz"
test -r "$incoming.json"
mkdir -p "$state_dir/deployment/releases" "$state_dir/deployment/evidence" "$state_dir/deployment/rollback"
exec 9>"$state_dir/.image-deploy.lock"
flock -n 9 || { echo 'Another image deployment is active.' >&2; exit 75; }
release_dir="$state_dir/deployment/releases/$revision"
mkdir -p "$release_dir"
tar --extract --gzip --file "$incoming.tar.gz" --directory "$release_dir" --no-same-owner
cd "$release_dir"
# Regenerate the environment from the validated closed manifest; never source an uploaded shell file.
python3 - "$incoming.json" "$revision" "$release_dir/deployment" <<'PY'
import json,runpy,sys
functions=runpy.run_path('scripts/delivery-images.py')
functions['write_files'](functions['validate'](json.load(open(sys.argv[1])),sys.argv[2]),sys.argv[3])
PY
ln -sfn "$config/runtime.env" .env
export MODELLING_ENV_FILE="$config/runtime.env"
if [[ -r "$config/chat.env" ]]; then export MODELLING_CHAT_ENV_FILE="$config/chat.env"; fi
export MODELLING_STORAGE_SECRET_DIR="$config/storage"
export MODELLING_ENGINE_KEY_FILE="$config/engine-key"
export MODELLING_CDR_KEY_FILE="$config/cdr-key"
export MODEL_GIT_KEY_HOST_PATH="$config/git/deploy_key"
export MODEL_GIT_HOSTS_HOST_PATH="$config/git/known_hosts"
export MODELLING_CA_FILE=/usr/local/share/ca-certificates/hygeoniq-development-ca.crt
base=(docker compose -p "$project" --env-file "$config/runtime.env")
compose=("${base[@]}" --env-file "$release_dir/deployment/images.env" -f docker-compose.yml)
if [[ "$environment" == development ]]; then compose+=(-f deploy/compose.dev-host.yml); fi
git_overlay=$(bash scripts/delivery-git-mount.sh "$MODEL_GIT_KEY_HOST_PATH" "$MODEL_GIT_HOSTS_HOST_PATH")
if [[ -n "$git_overlay" ]]; then compose+=(-f "$git_overlay"); fi
if [[ "$environment" == development && -r "$config/chat.env" ]]; then compose+=(-f deploy/compose.chat-dev.yml); fi
storage=false
if [[ -r "$config/storage/governance-password" ]]; then compose+=(-f deploy/compose.storage.yml); storage=true; fi
engine=false
if [[ -r "$config/engine-key" ]]; then compose+=(-f deploy/compose.engine.yml); engine=true; fi
if [[ -r "$config/cdr-key" ]]; then compose+=(-f deploy/compose.cdr.yml); fi
compose+=(-f deploy/compose.images.yml)
if [[ "$engine" == true ]]; then compose+=(-f deploy/compose.engine-images.yml); fi
browser_target=$(docker compose --env-file "$config/runtime.env" -f docker-compose.yml config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["chat"]["build"]["target"])')
if [[ "$environment" == development && -r "$config/chat.env" ]]; then browser_target=chat; fi
if [[ "$browser_target" == reviews ]]; then
  export MODELLING_CHAT_IMAGE
  MODELLING_CHAT_IMAGE=$(python3 -c 'import json; print(json.load(open("deployment/images.json"))["images"]["reviews"])')
elif [[ "$browser_target" != chat ]]; then echo 'Unsupported browser image target.' >&2; exit 2; fi
"${compose[@]}" config --quiet
"${compose[@]}" config --format json | python3 -c 'import json,sys; s=json.load(sys.stdin)["services"]; assert all("build" not in v for v in s.values()); assert all("@sha256:" in s[k]["image"] for k in ["app","chat","ingress"])'
"${compose[@]}" pull --quiet
components=(app chat ingress)
if [[ "$engine" == true ]]; then components+=(engine); fi
for component in "${components[@]}"; do
  image=$("${compose[@]}" config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"][sys.argv[1]]["image"])' "$component")
  test "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$revision"
done

# Capture existing container images and Compose paths before any change, including the first migration to digest delivery.
snapshot="$state_dir/deployment/rollback/$revision.json"
python3 - "$project" "$snapshot" <<'PY'
import json,subprocess,sys
project,path=sys.argv[1:]
ids=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project='+project],text=True).split()
items=json.loads(subprocess.check_output(['docker','inspect',*ids])) if ids else []
services={i['Config']['Labels']['com.docker.compose.service']:i['Image'] for i in items if i['Config']['Labels']['com.docker.compose.service'] in ['app','chat','ingress','engine']}
app=next((i for i in items if i['Config']['Labels']['com.docker.compose.service']=='app'),None)
labels=app['Config']['Labels'] if app else {}
json.dump({'images':services,'cwd':labels.get('com.docker.compose.project.working_dir'),'files':labels.get('com.docker.compose.project.config_files','').split(',') if app else [],'environmentFiles':labels.get('com.docker.compose.project.environment_file','').split(',') if app else []},open(path,'w'))
PY
rollback() {
  echo 'Deployment failed; restoring recorded images without rebuilding or deleting volumes.' >&2
  python3 - "$snapshot" "$project" "$state_dir" <<'PY'
import json,subprocess,sys
from pathlib import Path
snapshot,project,state=sys.argv[1:]; data=json.load(open(snapshot))
if not data['cwd'] or not data['images']: raise SystemExit('No previous running stack is available for rollback.')
overlay=Path(state)/'deployment'/'rollback'/'restore.yml'
overlay.write_text('services:\n'+''.join('  '+service+':\n    image: '+image+'\n    build: !reset null\n' for service,image in data['images'].items()))
args=['docker','compose','-p',project]
for file in data['environmentFiles']:
 if file: args+=['--env-file',file]
for file in data['files']: args+=['-f',file]
args+=['-f',str(overlay),'up','-d','--no-build','--pull','never','--wait','--wait-timeout','180']
subprocess.run(args,cwd=data['cwd'],check=True)
PY
}
trap rollback ERR
if [[ "$storage" == true ]]; then scripts/prepare-postgres.sh "$state_dir" "${compose[@]}"; fi
"${compose[@]}" up -d --no-build --pull never --wait --wait-timeout 180
python3 - "$config/runtime.env" "$origin" "$state_dir/deployment/evidence/$revision.json" <<'PY'
import os,subprocess,sys
from pathlib import Path
file,origin,evidence=sys.argv[1:]
for line in Path(file).read_text().splitlines():
 if line.startswith(('AUTH_API_KEY=','AUTH_API_KEY_HEADER=','MCP_SERVER_NAME=')):
  key,value=line.split('=',1);os.environ[key]=value.strip('"\'')
subprocess.run(['python3','scripts/mcp-smoke.py','--url',origin+'/mcp','--evidence',evidence],check=True)
PY
printf '%s\n' "$revision" > "$state_dir/current-revision"
cp "$release_dir/deployment/images.json" "$state_dir/deployment/evidence/$revision-images.json"
trap - ERR
printf 'Deployed %s %s from immutable images.\n' "$environment" "$revision"
