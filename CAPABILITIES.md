# Capability matrix

WORKING means the described subset is implemented; it does not imply clinical approval. Execution evidence and environment limits are in [the implementation report](docs/IMPLEMENTATION_REPORT.md).

| Capability | Status | Implemented boundary |
|---|---|---|
| MCP HTTP and stdio; discovery, prompts and resources | WORKING | Client-neutral SDK protocol; no model SDK |
| Branding and named CKM selection | WORKING | Administrator-configured HTTPS sources; same CKM REST contract |
| Existing CKM, guide, examples, terminology and type tools | WORKING | Upstream features retained |
| Persistent projects, artifacts, metadata and history | WORKING | Filesystem snapshots or plain files in Git; expected revisions and opt-in writes |
| Local value sets, lookup and code membership | WORKING | Explicit codes and versions; inactive codes rejected |
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
| Native inbound OIDC, tenant RBAC | NOT IMPLEMENTED | Configuration fails closed; interface reserved |
| Git storage with GitHub/GitLab/other remotes | WORKING | Plain model files, commit history, remote sync, CAS updates; branch/diff adapter methods |
| Hosted Git reviews and SharePoint storage | NOT IMPLEMENTED | Generic Git storage is available; provider-specific review/Graph APIs remain separate work |
| OPT compilation, native template editing/terminology application | NOT IMPLEMENTED | Requires qualified compiler/modelling engine |
| AQL parser/execution, composition validation, CDR deployment | NOT IMPLEMENTED | Prompts/examples and optional adapter boundary only |
| Copilot Studio tenant connection | NOT TESTED | Current official deployment guide; no tenant available |
| Visual editor and REST application API | NOT IMPLEMENTED | Architecture prepared |
