# Configuration reference

The executable source of truth is `src/Configuration/Settings.php`. `.env.example` contains local defaults, not production credentials. Compose reads `.env`; the PHP process itself reads process environment only. Restart/recreate containers after changes. Do not commit `.env` or include secret values in logs.

| Variable | Code default | Meaning / requirement |
|---|---|---|
| `APP_ENV` | `development` | development, testing or production; production HTTP requires authentication. |
| `PRODUCT_NAME` | `openEHR Modelling Assistant` | Human product name in instructions. |
| `PRODUCT_SHORT_NAME` | `openEHR Modelling Assistant` | Brand metadata reserved for client/UI presentation; not rendered by a server UI. |
| `PRODUCT_VENDOR` | `EY` | Deployment branding metadata; not an authorship/licence replacement. |
| `PRODUCT_DESCRIPTION` | `AI-assisted openEHR modelling and knowledge services` | MCP server description. |
| `PRODUCT_URL` | empty | Optional HTTPS MCP website URL. |
| `PRODUCT_SUPPORT_URL` | empty | Optional branding metadata for integrators. |
| `PRODUCT_DOCUMENTATION_URL` | empty | Optional branding metadata for integrators. |
| `PRODUCT_LOGO_URL` | empty | Optional HTTPS MCP icon URL. |
| `MCP_SERVER_NAME` | `openehr-modelling-assistant` | MCP serverInfo name; clients can verify this identity. |
| `MCP_TRANSPORT` | `streamable-http` | streamable-http or stdio; --transport CLI option overrides. |
| `MCP_HOST` | `127.0.0.1` | Compose published bind address; 127.0.0.1 by default. |
| `MCP_PORT` | `8343` | Compose published port, 1–65535; internal ingress port remains 8343. |
| `MCP_ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | Comma-separated literal hostnames without ports; no wildcard. |
| `CORS_ALLOWED_ORIGINS` | empty | Comma-separated HTTPS browser origins, no path/trailing slash; empty denies browser origins. |
| `AUTH_MODE` | `none` | none (local), api_key (implemented), oidc (reserved; startup fails). |
| `AUTH_API_KEY` | empty | Required secret for api_key, at least 32 characters. |
| `AUTH_API_KEY_HEADER` | `X-API-Key` | Inbound MCP key header name. |
| `OIDC_ISSUER` | empty | Reserved HTTPS issuer, no native verifier yet. |
| `OIDC_AUDIENCE` | empty | Reserved audience; no native verifier yet. |
| `OIDC_JWKS_URI` | empty | Reserved HTTPS JWKS URL; no native verifier yet. |
| `CKM_API_BASE_URL` | `https://ckm.openehr.org/ckm/rest/` | HTTPS REST base for source default. |
| `CKM_TIMEOUT` | `15` | CKM timeout seconds, positive integer. |
| `CKM_SOURCES` | `{}` | JSON object mapping additional names to HTTPS REST base URLs. |
| `CKM_DEFAULT_SOURCE` | `default` | Configured name used when a tool omits ckm. |
| `TERMINOLOGY_FHIR_BASE_URL` | empty | Optional HTTPS FHIR base; empty disables external terminology calls. |
| `TERMINOLOGY_BEARER_TOKEN` | empty | Optional external terminology bearer secret; mutually exclusive with API key. No token refresh. |
| `TERMINOLOGY_API_KEY` | empty | Optional external terminology service secret, separate from inbound AUTH_API_KEY. |
| `TERMINOLOGY_API_KEY_HEADER` | `X-API-Key` | Outbound terminology key header. |
| `TERMINOLOGY_CODESYSTEM_VALIDATE_PARAMETER` | `url` | url (FHIR standard) or explicit system compatibility for a legacy provider. |
| `HTTP_TIMEOUT` | `15` | External terminology timeout seconds. Legacy fractional environment values round upward; CKM inherits it if CKM_TIMEOUT absent. |
| `HTTP_SSL_VERIFY` | `true` | Must be true; false is rejected. |
| `HTTP_CA_BUNDLE` | empty | Optional readable CA bundle path mounted in the container. |
| `MAX_REQUEST_BYTES` | `2097152` | HTTP body limit; effective tool content budget is smaller due to JSON envelope. |
| `MAX_UPSTREAM_BYTES` | `8388608` | Maximum downloaded response bytes; also bounded by format-specific parsers. |
| `LOG_LEVEL` | `info` | debug/info/notice/warning/error/critical/alert/emergency; logs remain redacted. |
| `MODEL_REPOSITORY_PROVIDER` | `filesystem` | filesystem and git are implemented; github/gitlab/sharepoint are reserved provider-specific modes. Use git for GitHub/GitLab storage. |
| `MODEL_REPOSITORY_PATH` | `/tmp/openehr-models` | Absolute private writable path. Compose overrides it to /data/models; development override uses /tmp/development-models. |
| `MODEL_REPOSITORY_WRITE_ENABLED` | `false` | true enables draft project/artifact write tools; false denies them. |

| `MODEL_GIT_CONTENT_PATH` | empty | Relative model root in Git, e.g. local; does not move existing files. |
| `MODEL_GIT_LAYOUT` | `categories` | categories stores category folders; flat maps native ADL/template filenames at the configured root. |
| `MODEL_GIT_REMOTE_URL` | empty | Optional Git remote: ssh://, anonymous HTTPS, absolute local Git path; empty means offline Git. |
| `MODEL_GIT_BRANCH` | `main` | Branch for reads and draft commits. |
| `MODEL_GIT_SYNC_SECONDS` | `5` | Read refresh interval, 0–300 seconds. Writes always refresh. |
| `MODEL_GIT_TIMEOUT` | `30` | Per-command Git timeout, 1–120 seconds. |
| `MODEL_GIT_AUTHOR_NAME` | `openEHR Modelling Assistant` | Git service committer name; not human approval identity. |
| `MODEL_GIT_AUTHOR_EMAIL` | `modelling-assistant@localhost` | Git service committer email. |
| `MODEL_GIT_SSH_KEY_FILE` | empty | Private SSH key path inside container; configure with known-hosts path. |
| `MODEL_GIT_KNOWN_HOSTS_FILE` | empty | Pinned SSH host identities; strict verification remains enabled. |

Other supported process settings: `HTTPS_PROXY` and comma-separated `NO_PROXY` control outbound HTTPS; `XDG_DATA_HOME` changes the cache/session root (default `/tmp`, application subdirectory added). Legacy `ALLOWED_HOSTS` is accepted only when `MCP_ALLOWED_HOSTS` is absent. Composer development uses `COMPOSER_HOME`. No model-provider or CDR secret is required. Private Git remotes use the optional SSH credential files above; provider-specific GitHub/GitLab API and Graph tokens are not consumed.

## Multiple CKMs

```dotenv
CKM_SOURCES='{"regional":"https://regional.example.org/ckm/rest/","organisation":"https://models.example.org/ckm/rest/"}'
CKM_DEFAULT_SOURCE=regional
```

Replace example domains with actual CKM REST bases. The default international source remains available as `default`; change `CKM_API_BASE_URL` to replace it. Call `ckm_sources`, then pass `ckm:"regional"` to search/get/draft tools. Each server must implement the compatible CKM REST API; authenticated/private CKM credentials and federation across different API families are not implemented. Configuring multiple named sources is supported and unit-tested; only the public international CKM has a live endpoint test.

See [deployment](DEPLOYMENT.md) for environment choices, [security](SECURITY.md) for trust boundaries, and [terminology](TERMINOLOGY.md) for terminology server/Keycloak configuration.
