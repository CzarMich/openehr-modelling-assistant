# Security model

HTTP production startup requires API-key authentication. Generate a high-entropy secret of at least 32 characters, store it outside Git, configure clients through their credential store and rotate by recreating the application and updating clients. API keys represent one deployment service principal; there is no per-user RBAC or tenant isolation. Use separate deployments for separate trust domains. Stdio relies on local process permissions.

The guard validates Host and Origin independently, rejects unexpected body sizes and checks keys with constant-time comparison. SDK DNS-rebinding middleware remains active. CORS defaults to no browser origins. Production `AUTH_MODE=none` fails closed; `AUTH_MODE=oidc` fails until an actual verifier exists. An API gateway can add enterprise identity and rate limits while forwarding an application key. Health/readiness contain no model content and should remain on a restricted monitoring path.

External CKM and terminology endpoints are administrator-configured HTTPS origins. Tools select source names rather than arbitrary URLs. Relative path validation, bounded requests/responses, TLS verification, disabled redirects and timeouts limit outbound exposure. Use network egress controls to restrict configured destinations; this is not a general DNS/IP anti-SSRF resolver. A CA bundle supports enterprise certificates without disabling TLS validation.

XML rejects DTDs, entities, network resolution, oversized bodies and excessive elements. Artifact roots/paths reject traversal and symlinks. Repository contents are untrusted: notes, metadata and retrieved text cannot authorize a tool, prove approval or override client instructions. Do not submit patient data to this modelling service. No LLM inference or telemetry endpoint is embedded in the runtime.

JSON logs allowlist request metadata and omit tool arguments, bodies, secrets and exception traces. Infrastructure access logs may contain request URLs; clients should not put credentials or clinical content in query strings. Protect Docker access, secret files and model volumes. Non-root containers run with a read-only root filesystem, dropped capabilities, temporary scratch storage and private FPM networking. TLS termination, rate limiting, backup encryption, monitoring and HA remain deployment responsibilities.

Validation scope is a safety boundary: malformed/unavailable upstream responses never become successful validation, missing stages remain NOT_EXECUTED, and preflight cannot approve a clinical model. See [governance](GOVERNANCE.md). Dependency audit and executable security cases are part of [testing](testing.md).

## Browser chat

The optional [chat service](BROWSER_CHAT.md) validates OIDC identity independently of MCP authentication. It uses same-origin CSRF checks, opaque secure cookies, private per-user conversations and a fixed tool allowlist. Its shared MCP service credential stays server-side. Each repository write requires a browser confirmation bound to the current user, conversation and exact proposed arguments; it is not clinical approval. The isolated Codex container has no host workspace or Docker socket and exposes no shell, image or delegation tools. Single-organisation model access is shared; per-project RBAC and native MCP OIDC remain unfinished.
