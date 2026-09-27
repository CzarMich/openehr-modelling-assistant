# Design and requirement mapping

The current design is documented in [Architecture](ARCHITECTURE.md). The [requirements](requirements.md) and [traceability map](traceability.md) connect capabilities to code and tests. Historical architectural decisions remain under [decisions](decisions/README.md); ADR-0008 supersedes deployment and plugin assumptions from the upstream product.

## Browser client

REQ-F15 adds an optional Node chat service alongside the PHP MCP core. It uses verified OIDC identity, private per-user conversations, streamed Codex responses and exact-change confirmation before model writes. See [browser architecture and deployment](BROWSER_CHAT.md), [system architecture](ARCHITECTURE.md) and the browser/security tests in `chat/test/`. It does not introduce a visual archetype editor. Native inbound MCP bearer verification is a separate [identity adapter](OIDC.md).

## Human governance adapter

REQ-F16 adds transport-independent exact-revision governance, a protected append-only ledger, authenticated browser review and a versioned review API. MCP exposes preparation and review requests, never clinical approval. Browser role claims and dedicated request assertions establish interactive identity; qualified validation remains mandatory. [ADR-0015](decisions/0015-persisted-governance-and-interactive-human-approval.md) records this boundary. [OpenAPI](openapi/reviews.json), [governance](GOVERNANCE.md) and [deployment](REVIEW_DEPLOYMENT.md) describe its contracts.

## Project requirements and evidence graph

REQ-F17 adds shared services for versioned typed requirements, decisions, exact model anchors and governance evidence. Four MCP adapters expose conditional graph saves, reads, element explanations and requirement queries. [ADR-0016](decisions/0016-versioned-requirements-graph-and-evidence-boundaries.md) explains the separation of declarations, reference checks and clinical satisfaction. [The graph contract](REQUIREMENTS_TRACEABILITY.md) documents storage, limits and migration.

REQ-F18 adds separate document validation stages and exact-revision project QA through shared application services. Formal findings retain parse/profile errors, recorded evidence and unavailable engine checks independently. [ADR-0017](decisions/0017-staged-document-validation-and-project-evidence-qa.md) and [Validation and QA](VALIDATION_AND_QA.md) define contracts and migration.

REQ-F19 binds optional service credentials to configured CKM sources and exposes bounded federation through a knowledge port and shared application service. [ADR-0018](decisions/0018-source-bound-ckm-authentication-and-federated-discovery.md) records source identity, deadline and credential boundaries.

REQ-F20: `src/Mcp` bounds the supported protocol profile and SDK integration; clients retain negotiation and correlate responses. Production HTTP/stdio acceptance is independent of clinical services. See [MCP protocol](MCP_PROTOCOL.md).

REQ-N13 adds PostgreSQL governance and optional revision-bound Valkey retrieval caching. [ADR-0021](decisions/0021-postgres-governance-and-immutable-model-cache.md) keeps source, identity and audit authority independent of disposable caches.

REQ-F21: `NativeModels` and `TemplateBuilds` use the provider-neutral `OpenEhrEngine` port. The authenticated private Java adapter runs Archie validation/OPT 2 compilation, the bounded OET/OPT 1.4 compatibility adapter and native AQL parsing. Repository builds save native OPT content and exact-revision evidence atomically. [Compiler architecture and deployment](OPT_COMPILATION.md), [ADR-0020](decisions/0020-native-openehr-engine.md).
