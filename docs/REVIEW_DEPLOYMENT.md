# Deploying the human review workspace

The review workspace is an optional OIDC browser adapter to the provider-neutral modelling core. It can run without conversational chat, an LLM account, a CDR or an external terminology server. Models still require qualified validation before clinical approval or publication.

## Environments and storage

For a local container contract check, run `scripts/test-governance-container.sh`. It uses isolated synthetic identities, fixture keys, model volumes and an actual core container. Its keys are never deployment credentials.

For development, staging and production, use authenticated HTTPS, persistent model storage and a separate persistent governance ledger. The root Compose configuration mounts `governance:/data/governance`. The browser needs no ledger mount. Retain that volume across upgrades. Use one authoritative core/ledger instance for each repository governance namespace; separate development and server deployments do not automatically share approval history.

The default browser image target is `reviews`; it contains OIDC and review functionality without a model-provider executable. Conversational chat requires `MODELLING_BROWSER_TARGET=chat` and the separately configured provider credential. The existing development chat override explicitly selects that target. If enabling chat on an older deployment, select the target before rebuilding; startup fails clearly when chat is enabled in a review-only image.

## Core variables

| Variable | Default | Purpose |
|---|---|---|
| `GOVERNANCE_ENABLED` | `false` | Enable persisted governance operations |
| `GOVERNANCE_DATABASE_PATH` | `/data/governance/audit.sqlite` | Separate persistent SQLite ledger; never place in a shared Git checkout |
| `GOVERNANCE_BROWSER_ORIGIN` | empty | Exact public browser origin, without a path or trailing slash |
| `GOVERNANCE_OIDC_ISSUER` | empty | Exact verified browser identity issuer |
| `GOVERNANCE_BROWSER_KEYS` | `{}` | JSON object of accepted key identifiers to dedicated random signing keys; up to three keys for rotation |
| `GOVERNANCE_SESSION_MAX_AGE` | `900` | Maximum browser sign-in age in seconds, 60–3600 |
| `GOVERNANCE_ROLE_MAP` | role mapping in `.env.example` | Domain role to accepted signed ID-token role values |
| `MODEL_REPOSITORY_WRITE_ENABLED` | `false` | Required for lifecycle changes as well as model draft writes |

Generate a separate random key with `openssl rand -hex 32` into a protected credential file or secret manager. Configure that value as the active key in the core and browser; never paste it into a model, MCP request, Git file, browser page or shared log. Accepted key values are 64–128 lowercase hex characters. An example structure is `{"active":"<dedicated-random-key>"}`; the placeholder is not a valid key.

Defaults map `modeller`, `reviewer`, `approver` and `publisher` to `modelling-modeller`, `modelling-reviewer`, `modelling-approver` and `modelling-publisher`. There is no implicit clinical permission for an administrator. Assign real clinical roles according to organisational policy. The software must not grant an AI service account human approval authority.

## Browser variables

Existing `CHAT_PUBLIC_URL`, `CHAT_OIDC_ISSUER`, `CHAT_OIDC_CLIENT_ID`, `CHAT_OIDC_CLIENT_SECRET`, optional `CHAT_ALLOWED_GROUPS` and `CHAT_MCP_URL` configure the browser identity and core location. The review API uses the origin of `CHAT_MCP_URL`, and does not forward its normal MCP API key.

| Variable | Default | Purpose |
|---|---|---|
| `CHAT_REVIEW_ENABLED` | `false` | Enable `/chat/reviews` and its authenticated backend |
| `CHAT_REVIEW_SIGNING_KEY` | empty | The dedicated active review key, kept server-side |
| `CHAT_REVIEW_KEY_ID` | `active` | Identifier matching `GOVERNANCE_BROWSER_KEYS` |
| `CHAT_REVIEW_ROLES_CLAIM` | `roles` | Dot-separated signed ID-token role claim, for example `realm_access.roles` |
| `CHAT_REVIEW_TENANT_CLAIM` | empty | Signed tenant claim when using native core OIDC tenant isolation |
| `CHAT_REVIEW_SESSION_MAX_AGE` | `900` | Browser-side maximum sign-in age; match the core policy |
| `CHAT_ENABLED` | `false` | Conversational chat; may remain false for human review |
| `MODELLING_BROWSER_TARGET` | `reviews` | Compose build target; use `chat` only when its provider adapter is needed |

Configure the identity provider's confidential browser client with redirect URI `<browser-origin>/chat/auth/callback`, authorization-code flow and PKCE. Ensure the selected role claim is included in the **signed ID token**, not only in the access token or user-info response. For Keycloak, a protocol mapper/client scope can expose assigned roles; for Entra or another OIDC provider, use its equivalent application-role claim. Keep engineering/admin permissions separate from clinical approver assignments.

In core `AUTH_MODE=oidc`, the browser issuer must match `OIDC_ISSUER`; the tenant claim and allowed tenants must match the core policy. Signed browser identity resolves to the same subject/tenant namespace as native bearer authentication. Existing per-tenant Git/SharePoint mappings continue to apply. API-key/local deployments use one shared repository namespace; browser users still have distinct authenticated actor identities.

## Upgrade, rotation and backup

Build and start the configured containers, then inspect `/ready`, `/chat/api/session` and the review page through the HTTPS gateway. A healthy container proves startup, not that an identity provider has supplied appropriate clinical roles. A user with the configured role must verify actual interactive sign-in. Synthetic fixtures are not live tenant acceptance evidence.

For signing-key rotation, first add the new key identifier/value to the core's accepted map. Switch the browser to that identifier/value, then remove the previous key after its short-lived assertions have expired. Restart the browser to invalidate in-memory sessions when role assignments or identity policy change. No approval key is available to the model worker.

Back up model storage and the governance ledger separately. Use SQLite's [consistent online backup](https://www.sqlite.org/backup.html) or [VACUUM INTO procedure](https://www.sqlite.org/lang_vacuum.html), or stop the core before copying the database and its journal state. Do not copy only an active `.sqlite` file while ignoring its WAL. Preserve file permissions and encryption/access policy in backup storage. Restore into an isolated deployment first, verify audit history and hash chains, compare model revisions and keep publication disabled until required qualification checks pass. A ledger backup is not an external signed audit attestation.

The current qualified-engine gap deliberately blocks real clinical approval/publication. The review workspace can record review findings and requests for changes while that gate remains open.
