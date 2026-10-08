# Automated deployment, packages and releases

A successful validation of the exact current `main` revision triggers **Automated openEHR delivery**. It builds all application components on GitHub-hosted runners, publishes container packages, deploys to Dev and verifies the authenticated MCP endpoint, then automatically deploys the same immutable image digests to production. Builds do not run on either deployment host. Stale revisions are skipped before deployment; overlapping deliveries are serialized.

## Published packages

Every validated delivery publishes five GHCR packages with a full `sha-<revision>` tag:

- `ghcr.io/czarmich/openehr-modelling-assistant-app`
- `ghcr.io/czarmich/openehr-modelling-assistant-chat`
- `ghcr.io/czarmich/openehr-modelling-assistant-reviews`
- `ghcr.io/czarmich/openehr-modelling-assistant-ingress`
- `ghcr.io/czarmich/openehr-modelling-assistant-engine`

The browser target remains selected by protected deployment configuration; Dev's browser overlay selects chat. Engine and storage integrations remain optional. Image manifests bind each component to the full source revision and a registry digest. The deployment validates the closed manifest and each image's revision label before updating the stack. It overrides Compose build settings and uses `--no-build --pull never` after pulling verified images.

Managed browser URLs:

| Environment | Browser | MCP |
| --- | --- | --- |
| Dev | https://dev-openehr-modelling.sandbox.hygeoniq.com/chat/ | https://dev-openehr-modelling.sandbox.hygeoniq.com/mcp |
| Production | https://openehr-modelling.sandbox.hygeoniq.com/chat/ | https://openehr-modelling.sandbox.hygeoniq.com/mcp |

Dev uses LAN/VPN name mapping and the trusted development CA. Each browser now declares SVG, ICO and PNG touch icons; gateway and browser service routes serve them without a sign-in requirement.

## Host setup and persistence

The dedicated Dev runner has labels `self-hosted, Linux, X64, openehr-modelling-dev`. Only successfully validated current main reaches it. Its managed state is `/opt/hygeoniq/projects/openehr-modelling-assistant`; production uses `/opt/openehr-modelling-assistant`. Each host requires `config/deploy-environment` containing `development` or `production`, plus its existing protected `runtime.env`, browser `chat.env` and optional service/Git/storage keys. The workflow reuses `MODELLING_VPS_SSH_KEY` and pinned `MODELLING_VPS_KNOWN_HOSTS` for production. GHCR uses the short-lived workflow token in an isolated Docker configuration that is removed after delivery.

Existing Compose project names and volumes are preserved: `openehr-modelling-dev` and `openehr-modelling-assistant`. Runtime environment, issuer, user accounts, repositories and PostgreSQL authority are not recreated. Existing SQLite-to-PostgreSQL cutover markers are respected. Read-only Git credentials and optional native-engine/CDR keys keep their original paths. Before updates, the script records running image IDs and Compose paths; on health or MCP-smoke failure it restores those images without rebuilding or deleting volumes.

Source archives, validated manifests, exact current revision and protocol-smoke evidence are retained under the managed state directory. GitHub uploads separate Dev and production evidence for 90 days. Run `scripts/watch-ci.sh <full revision>` after every push and resolve failures, including downstream delivery. The workflow can also be dispatched on main for recovery; its gate still requires a successful exact main validation.

Git credential mounts are selected by file existence, so private keys owned by the application user remain mounted even when the host runner cannot read their contents. A partially configured key/known_hosts pair stops deployment before changing containers. Key ownership and SSH permissions are preserved.

## Automatic releases

Version selection remains a maintainer action: set `APP_VERSION`, add the matching versioned CHANGELOG section and update the README version badge through review. Push a version tag, either `X.Y.Z` or `vX.Y.Z`, pointing to a main-history commit that already completed Dev and production delivery. Its numeric version must match `APP_VERSION`; the optional `v` prefix is preserved in the GitHub release name and package tags. A mismatched tag is rejected before publishing any release or package alias. This triggers **Publish verified release**. It can also be dispatched with an existing matching tag after delivery finishes.

The release requires matching `APP_VERSION`, main ancestry, an actual successful production deployment and retained image evidence. It promotes the verified digests to version tags for all five packages; the app also receives the historical root package alias `ghcr.io/czarmich/openehr-modelling-assistant:<version>`. It creates and publishes a GitHub release with versioned CHANGELOG notes, the image manifest, a source archive, a deployment bundle and SHA256SUMS. Secrets and user/model state are excluded. The pipeline does not rebuild release images or choose a new version automatically. Already published releases are preserved on reruns.

This automation concerns distributable application container and deployment packages. Clinical model exports and governed review/publication are independent user workflows.

## Verification

`python3 scripts/test-image-delivery.py` checks source mismatches, missing components, mutable/untrusted registry references, invalid deployment selectors and rendered Compose settings/volume names. CI runs these boundaries alongside the existing PHP, browser, native-engine, persistence and protocol checks. Full delivery is complete only after both protected environments pass health and authenticated MCP smoke tests.
