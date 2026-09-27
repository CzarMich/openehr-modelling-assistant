# Capability matrix

WORKING means the described subset is implemented; it does not imply clinical approval. Statuses describe delivered functionality on the main branch. Execution evidence and environment limits are in [the implementation report](docs/IMPLEMENTATION_REPORT.md); remaining implementation work and its saved state are in [the continuation handoff](docs/NEXT_SESSION.md).

| Capability | Status | Implemented boundary |
|---|---|---|
| MCP HTTP and stdio; discovery, prompts and resources | WORKING | Explicit version/capability profile with production HTTP/stdio product probes and applicable official scenarios; no model SDK |
| Branding and named CKM selection | WORKING | Administrator-configured HTTPS sources and source-specific Basic/session/bearer/API-key credentials; same CKM REST contract |
| Federated CKM discovery | WORKING | Bounded lexical/status ranking, distinct source/version provenance, per-source failures and honest window totals; public international/Norwegian and isolated authenticated acceptance |
| Existing CKM, guide, examples, terminology and type tools | WORKING | Upstream features retained |
| Persistent projects, artifacts, metadata and history | WORKING | Filesystem/SharePoint snapshots or plain files in Git; expected revisions and opt-in writes |
| Project terminology catalogue | WORKING | Versioned local CodeSystem, multi-system ValueSet and ConceptMap records; repository revisions, deterministic search and explicit external references |
| Local terminology operations | WORKING | Offline lookup, membership, expansion and review-only mapping candidates; independent editions, language, fragment and hierarchy rules |
| Modelling without terminology server or bindings | WORKING | Authenticated Git persistence, local checks and empty terminology manifests verified over HTTPS |
| External FHIR terminology (optional) | WORKING | Capabilities, multilingual lookup, code/value-set validation, bounded expansion and version evidence; provider-dependent datasets |
| FHIR ConceptMap translation | WORKING | Explicit map and source coding; repeated candidates retained, human review required, no automatic application |
| FHIR terminology resource discovery | WORKING | Configured-server CodeSystem/ValueSet/ConceptMap search and exact canonical resolution; server search support required |
| Draft OET generation | PARTIAL | Retrieved COMPOSITION plus direct ENTRY placements only |
| OET/OPT validation | PARTIAL | Separate parse/structure stages, identity/reference syntax and overflow-safe intervals; full schema/dependency/semantic qualification requires the engine |
| FLAT/STRUCTURED document profiles | WORKING | Unambiguous JSON, field/array/raw-value shapes and explicit stage findings; OPT/RM/terminology conformance remains unexecuted |
| ADL validation | PARTIAL | Declaration/header preflight; no grammar or RM validator |
| Model diff | PARTIAL | XML structure, attributes and leaf values; not full semantic equivalence |
| Binding validation | PARTIAL | Explicit records, path presence, selected-code validation; no native application |
| Explicit XML terminology inspection | WORKING | Bounded OET/OPT coded choices, named queries and native reference preservation; revision-specific locations, without inherited ADL semantics |
| Terminology binding plans | WORKING | Offline exact-membership proposals, explicit aliases, pinned local code validation, repository history and stale-evidence detection; review required |
| Terminology impact and manifest | PARTIAL | Concept/property diff and declared dependencies; no hierarchy/global index |
| Requirements traceability | WORKING | Versioned typed graph, deterministic element/requirement queries, exact XML/JSON anchors, authoritative audit references, stale-evidence findings and repository conflicts; coverage remains a modeller assertion, with native inherited paths awaiting the engine |
| Persisted model governance | WORKING | Exact-revision lifecycle, server-produced validation evidence, append-only audit chain, sequence conflicts and independent human decisions; real approval remains blocked until qualified validation is available |
| Browser human review and versioned review REST API | WORKING | Source/evidence inspection, role-based decisions, explicit confirmation and single-use request-bound assertions; ordinary MCP credentials cannot approve |
| Project QA and evidence checks | WORKING | Exact revisions, hash/freshness, recorded provenance, requirement trails, authoritative validation/review links and explicit terminology findings across storage providers |
| Full model QA and release qualification | PARTIAL | Formal findings name missing engine/dependency checks; document or evidence presence cannot certify clinical-model conformance |
| API-key authentication and hardened containers | WORKING | One deployment principal, single tenant; enterprise gateway required |
| Native inbound OIDC | WORKING | Pinned issuer/API audience, discovery/JWKS, RS256 verification, bounded rotation and signed scopes/roles; live identity-provider acceptance, Entra-style fixture coverage |
| Tenant storage and draft-write authorization | WORKING | Issuer/tenant namespaces, principal-bound sessions, scoped writes and distinct mapped Git remotes; API-key mode remains one service principal |
| Enterprise project/team RBAC | PARTIAL | Tenant isolation, scoped draft writes and distinct human governance roles implemented; project/team ACLs remain separate work |
| Git storage with GitHub/GitLab/other remotes | WORKING | Plain model files, commit history, remote sync, CAS updates; MCP branch creation and revision diff |
| Archetype Designer repository layouts | WORKING | Configurable content root; category folders or flat native files; Unicode/spaces preserved; real private Git round trip |
| Hosted Archetype Designer UI connection | NOT TESTED | Login required; repository integration verified independently, account linking and visual import/export not yet verified |
| Codex development connection | WORKING | Installed Codex app-server initialized the HTTPS service and discovered the modelling tool catalogue with a private credential helper |
| Browser modelling chat | WORKING | OIDC sign-in, private persistent conversations, streamed replies, actual tool activity and confirmed draft writes through an isolated Codex client; optional service |
| Browser identity and session isolation | WORKING | Authorization code flow with PKCE, signed identity claims, secure cookies, CSRF and per-user conversation ownership; shared model repository principal |
| Service introduction page | WORKING | Root URL links to browser chat, MCP connection and optional integrations; not a visual modeller |
| GitHub/GitLab hosting capabilities | WORKING | Shared Git storage plus configured-repository metadata, branches/protection and draft reviews; live GitHub acceptance, GitLab contract tests |
| GitLab live hosted acceptance | NOT TESTED | Adapter and contract tests implemented; requires a configured GitLab account/token |
| SharePoint storage | WORKING | Graph-backed immutable snapshots, conditional index updates, revisions/history/metadata and tenant mappings; OAuth and production-container contracts verified |
| SharePoint live tenant acceptance | NOT TESTED | Implementation and integration harness complete; requires external tenant credentials, identifiers and permissions |
| OPT compilation, native template editing/terminology application | NOT IMPLEMENTED | Requires qualified compiler/modelling engine |
| AQL parser/execution, composition validation, CDR deployment | NOT IMPLEMENTED | Prompts/examples and optional adapter boundary only |
| Copilot Studio tenant connection | NOT TESTED | Current official deployment guide; no tenant available |
| Visual editor | NOT IMPLEMENTED | Architecture prepared |
| General REST application API and CLI | PARTIAL | Versioned review API/OpenAPI implemented; remaining model application endpoints and shared CLI follow |
| Optional client packaging | WORKING | Default browser review image contains no model-provider executable; conversational adapter uses an explicit image target |
