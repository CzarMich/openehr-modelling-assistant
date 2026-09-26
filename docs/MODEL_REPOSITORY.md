# Persistent modelling projects

A conversation is not a model repository. `model_project_create`, `model_project_get`, `model_artifact_save`, `model_artifact_get` and `model_artifact_history` preserve work across conversations and application restarts. Enable writes explicitly with `MODEL_REPOSITORY_WRITE_ENABLED=true`.

The provider-neutral `ModelRepository` contract supports project list/get/create/archive, artifact list/get/save/delete and history. The MCP surface exposes list/get/create and artifact read/save/history; archive/delete are currently application interface operations only. Project metadata update and independent metadata endpoints are not implemented; metadata travels with each artifact revision.

## Logical layout

Use paths under `requirements/`, `archetypes/`, `templates/`, `terminology/`, `aql/`, `tests/`, `validation/`, `decisions/` and `documentation/`. No project needs every category. Markdown, JSON, YAML, ADL, OET, OPT and AQL are stored as text; storing an artifact does not validate its format.

The filesystem adapter stores `<project-id>.json` plus a lock file in `MODEL_REPOSITORY_PATH`. Logical paths are entries in that snapshot, not individual operating-system files. Every saved revision includes a random provider-neutral revision, content SHA-256, provider, timestamp, DRAFT status and caller-supplied metadata. Metadata is untrusted documentation: it does not prove authorship or approval. Reserved lifecycle/validation fields cannot be set through artifact metadata.

Creating uses `expectedRevision=null`; updating requires the current revision from `model_artifact_get`. A stale revision returns `REVISION_CONFLICT`. Deleted artifacts retain history with a tombstone. Archived projects reject writes. Atomic rename and per-project `flock` prevent torn writes within the supported single-instance filesystem. A backup copies complete snapshots while writes are stopped or under the same lock discipline. Restore to an empty persistent volume and verify hashes/history before reopening writes.

Limits: artifact 2 MiB, metadata 64 KiB, complete project including history 32 MiB. The HTTP envelope has its own lower effective content budget. There is no history pruning. Root and paths reject symlinks and traversal; grant the runtime UID exclusive write ownership. Hostile users with direct filesystem write access are outside this boundary. Container paths are Unix paths; Windows deployments use Docker volumes. A mounted network filesystem must be qualified for atomic rename and locking before use.

## Provider capabilities

| Provider | Storage/history | Branch/review/release | Availability |
|---|---|---|---|
| Filesystem | Implemented; platform revisions and exclusive locks | Not implemented | Offline; one active provider |
| GitHub | Not implemented | `GitRepository` extension contract prepared | Selecting it fails clearly |
| GitLab | Not implemented | Same provider-neutral Git extension | Selecting it fails clearly |
| SharePoint | Not implemented | Future Graph adapter isolated from domain | Selecting it fails clearly |

`model_projects` returns actual capabilities. No GitHub/GitLab/SharePoint credential variables are consumed today. Future adapters must supply configurable enterprise origins, provider revisions, optimistic concurrency, least-privilege identity and truthful capability discovery. An unsupported provider never silently falls back to filesystem.

A recommended metadata record records type, human version, explicit source CKM/version/hash, declared dependencies, requirement IDs, agent/client (when known), and decision record references. Do not fabricate a user identity, Git SHA, spec version or validation result. Save source retrieval provenance returned by `template_build_oet` alongside the draft.
