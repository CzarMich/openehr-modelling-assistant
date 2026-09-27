# Capability matrix

WORKING means the described subset is implemented; it does not imply clinical approval. Statuses describe delivered functionality on the main branch. Execution evidence and environment limits are in [the implementation report](docs/IMPLEMENTATION_REPORT.md); remaining implementation work and its saved state are in [the continuation handoff](docs/NEXT_SESSION.md).

| Capability | Status | Implemented boundary |
|---|---|---|
| MCP HTTP and stdio; discovery, prompts and resources | WORKING | Client-neutral SDK protocol; no model SDK |
| Branding and named CKM selection | WORKING | Administrator-configured HTTPS sources; same CKM REST contract |
| Existing CKM, guide, examples, terminology and type tools | WORKING | Upstream features retained |
| Persistent projects, artifacts, metadata and history | WORKING | Filesystem/SharePoint snapshots or plain files in Git; expected revisions and opt-in writes |
| Local value sets, lookup and code membership | WORKING | Explicit codes and versions; inactive codes rejected |
| Modelling without terminology server or bindings | WORKING | Authenticated Git persistence, local checks and empty terminology manifests verified over HTTPS |
| External FHIR terminology (optional) | WORKING | Capabilities, lookup, validation, bounded expansion; provider-dependent datasets |
| Draft OET generation | PARTIAL | Retrieved COMPOSITION plus direct ENTRY placements only |
| OET/OPT validation | PARTIAL | XML and structural profile; no schema/dependency/semantic certification |
| ADL validation | PARTIAL | Declaration/header preflight; no grammar or RM validator |
| Model diff | PARTIAL | XML structure, attributes and leaf values; not full semantic equivalence |
| Binding validation | PARTIAL | Explicit records, path presence, selected-code validation; no native application |
| Terminology impact and manifest | PARTIAL | Concept/property diff and declared dependencies; no hierarchy/global index |
| Requirements traceability | PARTIAL | Explicit declared coverage; no clinical/test proof |
| Governance and QA | PARTIAL | Tested policy boundary and truthful unavailable stages; no persisted approvals |
| API-key authentication and hardened containers | WORKING | One deployment principal, single tenant; enterprise gateway required |
| Native inbound OIDC | WORKING | Pinned issuer/API audience, discovery/JWKS, RS256 verification, bounded rotation and signed scopes/roles; live identity-provider acceptance, Entra-style fixture coverage |
| Tenant storage and draft-write authorization | WORKING | Issuer/tenant namespaces, principal-bound sessions, scoped writes and distinct mapped Git remotes; API-key mode remains one service principal |
| Enterprise project/team RBAC and human approval UI | NOT IMPLEMENTED | Native bearer identity does not prove interactive human approval; project ACLs and governance application remain separate work |
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
| Visual editor and REST application API | NOT IMPLEMENTED | Architecture prepared |
