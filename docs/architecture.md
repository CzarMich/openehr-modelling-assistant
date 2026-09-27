# Design and requirement mapping

The current design is documented in [Architecture](ARCHITECTURE.md). The [requirements](requirements.md) and [traceability map](traceability.md) connect capabilities to code and tests. Historical architectural decisions remain under [decisions](decisions/README.md); ADR-0008 supersedes deployment and plugin assumptions from the upstream product.

## Browser client

REQ-F15 adds an optional Node chat service alongside the PHP MCP core. It uses verified OIDC identity, private per-user conversations, streamed Codex responses and exact-change confirmation before model writes. See [browser architecture and deployment](BROWSER_CHAT.md), [system architecture](ARCHITECTURE.md) and the browser/security tests in `chat/test/`. It does not introduce a visual archetype editor. Native inbound MCP bearer verification is a separate [identity adapter](OIDC.md).

## Human governance adapter

REQ-F16 adds transport-independent exact-revision governance, a protected append-only ledger, authenticated browser review and a versioned review API. MCP exposes preparation and review requests, never clinical approval. Browser role claims and dedicated request assertions establish interactive identity; qualified validation remains mandatory. [ADR-0015](decisions/0015-persisted-governance-and-interactive-human-approval.md) records this boundary. [OpenAPI](openapi/reviews.json), [governance](GOVERNANCE.md) and [deployment](REVIEW_DEPLOYMENT.md) describe its contracts.
