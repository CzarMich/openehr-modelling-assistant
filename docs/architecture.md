# Design and requirement mapping

The current design is documented in [Architecture](ARCHITECTURE.md). The [requirements](requirements.md) and [traceability map](traceability.md) connect capabilities to code and tests. Historical architectural decisions remain under [decisions](decisions/README.md); ADR-0008 supersedes deployment and plugin assumptions from the upstream product.

## Browser client

REQ-F15 adds an optional Node chat service alongside the PHP MCP core. It uses verified OIDC identity, private per-user conversations, streamed Codex responses and exact-change confirmation before model writes. See [browser architecture and deployment](BROWSER_CHAT.md), [system architecture](ARCHITECTURE.md) and the browser/security tests in `chat/test/`. It does not introduce a visual archetype editor or native inbound MCP bearer verification.
