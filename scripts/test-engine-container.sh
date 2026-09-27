#!/usr/bin/env bash
set -euo pipefail
export ENGINE_TEST_REPO ENGINE_TEST_KEY
ENGINE_TEST_REPO=$(cd "$(dirname "$0")/.." && pwd)
engine_test_dir=$(mktemp -d -t modelling-engine.XXXXXXXX)
ENGINE_TEST_KEY="$engine_test_dir/service-key"
python3 - "$ENGINE_TEST_KEY" <<'PY'
import pathlib,secrets,sys
p=pathlib.Path(sys.argv[1]); p.write_text(secrets.token_hex(32)); p.chmod(0o444)
PY
compose=(docker compose -p "modelling-engine-test-$$" -f "$ENGINE_TEST_REPO/tests/fixtures/engine/compose.yml")
cleanup() { "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; rm -rf -- "$engine_test_dir"; }
trap cleanup EXIT
"${compose[@]}" up -d --build --wait
"${compose[@]}" cp engine:/app/sbom.json "$ENGINE_TEST_REPO/docs/evidence/engine-sbom.json"
"${compose[@]}" exec -T app php /probe.php
address=$("${compose[@]}" port ingress 8343)
python3 "$ENGINE_TEST_REPO/scripts/engine-fixture-smoke.py" --url "http://$address/mcp" --writes --catalogue "$ENGINE_TEST_REPO/docs/evidence/tool-catalogue.json" \
  --evidence "${1:-$ENGINE_TEST_REPO/docs/evidence/ci-engine-smoke.json}"
