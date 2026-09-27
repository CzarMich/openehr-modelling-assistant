# Requirements — openEHR Modelling Assistant

> Part of the [Specification-Driven Development docs](README.md). Each requirement
> has a stable ID (`REQ-F#` functional, `REQ-N#` non-functional). IDs are
> referenced by [architecture.md](architecture.md), the
> [decision records](decisions/), and the [traceability matrix](traceability.md).
> When behaviour changes, update the requirement here **first**, then the design,
> code, and tests that cite it.

## Purpose

The openEHR Modelling Assistant exposes openEHR domain knowledge — archetypes,
templates, guides, examples, terminology, and Reference/Archetype Model type
specifications — to AI agents over the [Model Context Protocol](https://modelcontextprotocol.io).
It is a *knowledge and authoring-assistance* server: it helps agents discover,
explain, design, and review openEHR artefacts. It is **not** a clinical data
repository and stores no patient data.

## Functional requirements

| ID | Requirement | Primary capability surface |
|----|-------------|----------------------------|
| **REQ-F1** | Search and retrieve archetypes and templates from the openEHR Clinical Knowledge Manager (CKM), with relevance scoring and result sizing. | Tools `ckm_archetype_search`, `ckm_archetype_get`, `ckm_template_search`, `ckm_template_get` |
| **REQ-F2** | Discover and retrieve implementation guides by category, and look up ADL constraint idioms. | Tools `guide_search`, `guide_get`, `guide_adl_idiom_lookup`; resource `openehr://guides/{category}/{name}` |
| **REQ-F3** | Discover and retrieve curated worked examples (AQL, FLAT, STRUCTURED payloads, gold-standard ADL archetypes). | Tools `examples_search`, `examples_get`; resource `openehr://examples/{kind}/{name}` |
| **REQ-F4** | Resolve openEHR terminology IDs, codes, and rubrics. | Tool `terminology_resolve`; resource `openehr://terminology` |
| **REQ-F5** | Look up Reference Model, Archetype Model, and BASE type specifications, including per-class attribute/function/invariant detail (BMM-backed). | Tools `type_specification_search`, `type_specification_get`; resource `openehr://spec/type/{component}/{name}` |
| **REQ-F6** | Provide guided MCP prompts for explaining, designing/reviewing, and exploring openEHR artefacts (archetypes, templates, AQL, simplified formats, terminology, type specs), plus ADL syntax fixing and translation. | `src/Prompts/*` (14 prompts) |
| **REQ-F7** | Expose retrievable resources for guides, examples, type specifications, and terminology via stable `openehr://` URIs. | `src/Resources/*` |
| **REQ-F8** | Offer argument auto-completion for guide names, example names, and specification components. | `src/CompletionProviders/*` |
| **REQ-F9** | Serve over two transports: `streamable-http` (default) and `stdio` (CLI/desktop clients). | `public/index.php`, `Helpers/CliOptions` |
| **REQ-F10** | Publish always-on server instructions encoding global tool-usage policy (Guide-First, Spec-Lookup-First, Digest-First, Examples-First). | `resources/server-instructions.md` |

## Non-functional requirements

| ID | Requirement | Rationale |
|----|-------------|-----------|
| **REQ-N1** | All openEHR-standard content must be grounded in authoritative sources (`specifications.openehr.org`, CKM, BMM); never invented from model memory. | Correctness of clinical/standards content is the product's core value. → [ADR-0005](decisions/0005-spec-aligned-content-retrieval.md) |
| **REQ-N2** | Every application class has a mirrored `*Test`; external HTTP (CKM) is mocked, never called live in tests. | Deterministic, offline-capable test suite. → [ADR-0002](decisions/0002-single-ckmclient-http-boundary.md) |
| **REQ-N3** | Code follows PSR-12 and passes PHPStan static analysis before merge. | Maintainability and reviewability. |
| **REQ-N4** | MCP capability discovery is cached at startup to keep server boot fast. | Responsiveness under repeated client connections. → [ADR-0001](decisions/0001-attribute-driven-discovery.md) |
| **REQ-N5** | The runtime is Docker-only and reproducible; no host PHP/Composer is assumed. | Consistent environment across maintainers (WSL2 on Windows). → [ADR-0004](decisions/0004-docker-only-runtime.md) |
| **REQ-N6** | Run the official MCP conformance suite against its explicit expected-failure baseline and separately verify the actual product tools over HTTP. | Interoperability with arbitrary MCP clients. |
| **REQ-N7** | Guide and prompt content is concise and scannable, optimised for AI context economy. | Content is consumed by agents under token budgets. → [ADR-0003](decisions/0003-prompt-policy-split.md) |
| **REQ-N8** | The requirement↔code↔test↔decision traceability map is machine-validated in CI; a missing artefact, dangling path, or index/map disagreement fails the build. | Keeps the SDD chain from silently rotting. → [ADR-0006](decisions/0006-machine-checked-traceability.md) |
| **REQ-N9** | Every published MCP tool schema is validated in CI: closed input schemas (`additionalProperties: false`, nullable optional enums, numbers bounded so out-of-range values are rejected rather than clamped), search results returned in a `{items, total}` envelope that is itself closed and `required`, and output payloads conforming to their declared `outputSchema`. Authoring recipe: [conventions.md](conventions.md#mcp-capabilities-authoring). | The SDK validates tool *input* against `inputSchema` but never validates tool *output*, so the output contract has no runtime enforcement — CI is the only thing standing between a schema edit and a broken wire contract. |
| **REQ-N10** | `docs/install.md` documents independent deployment of this fork and keeps all relative links resolvable. | The product does not require the upstream hosted service; ADR-0008 supersedes its installation contract. |

## Current extension boundaries

Native OPT compilation, full ADL/AQL validation, CDR execution, full project/team RBAC and a visual editor are not implemented. See CAPABILITIES.md for exact scope. No model SDK or client plugin is required.

## Modelling platform requirements

| ID | Requirement | Implementation |
|---|---|---|
| **REQ-F11** | Configurable branding and named CKM sources. | landed; exact boundaries in CAPABILITIES.md |
| **REQ-F12** | Provider-neutral persistent projects, artifacts and revisions. | landed; exact boundaries in CAPABILITIES.md |
| **REQ-F13** | Draft OET generation, bounded validation and structural diff. | partial; exact boundaries in CAPABILITIES.md |
| **REQ-F14** | Optional local/FHIR terminology, canonical discovery, review-only translation, independent versions, explicit bindings and provenance. | partial; exact boundaries in CAPABILITIES.md |
| **REQ-F15** | Authenticated browser chat with grounded tool calls, private conversation history, streaming and explicit confirmation of model writes. | landed; exact boundaries in CAPABILITIES.md |
| **REQ-N11** | Authenticated bounded transport and redacted failures. | landed; exact boundaries in CAPABILITIES.md |
| **REQ-N12** | Client-neutral deployment and truthful capability documentation. | landed; exact boundaries in CAPABILITIES.md |

| **REQ-F16** | Persist exact-revision governance and immutable audit events; permit clinical approval only through an independent authenticated human session after qualified validation, never through an AI/MCP caller. | `Application/ModelGovernance`, `Domain/Governance`, `Rest/ReviewApi`, browser review workspace |

## Queryable project requirements

| ID | Requirement | Primary capability surface |
|---|---|---|
| **REQ-F17** | Persist typed requirements, decisions and exact model/evidence links; answer element rationale and requirement coverage deterministically, with stale/missing/unexecuted evidence and declared clinical satisfaction kept distinct. | `model_traceability_*`, shared application/domain services and repository/audit contracts |

| **REQ-F18** | Separate deterministic document validation stages and formal QA findings; connect exact repository revisions to recorded provenance, requirements and authentic validation/review evidence without inferring release qualification. | `model_validate`, `model_qa`, `model_project_qa` and shared services |
