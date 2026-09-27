# Continuation handoff

The user has resumed full implementation under the A–Z mandate. Follow the [completion audit](COMPLETION_AUDIT.md) and [execution queue](COMPLETION_QUEUE.json) continuously through the remaining phases. The [autonomous execution policy](AUTONOMOUS_EXECUTION_POLICY.md) remains in force; no routine development or delivery confirmation is needed. Keep terminology/bindings optional and use generic user-facing names: terminology server, server and CDR.

## Accepted work

- Filesystem, SharePoint and Git ModelRepository providers, private hosted remotes, revision conflict handling and native files.
- Configurable Git content root and category/flat layouts for authoring repositories; Unicode filenames.
- Authenticated development HTTPS endpoint and actual local Codex discovery verification.
- Shared private model repository with scoped SSH credentials and bidirectional native-file tests.
- Architecture/workflow updates, capability evidence and metadata schema regression fix.

The capability matrix describes shipped code, not work in an isolated branch. Hosted Designer login/account authorization is still unavailable; Git interoperability does not establish a visual round trip. Do not claim that connection is complete.

## Browser chat follow-up delivered

The user subsequently requested an actual browser chat, so that feature was implemented as a separate Node MCP client. See [browser chat](BROWSER_CHAT.md). Browser OIDC sign-in and conversation ownership are separate from native MCP bearer verification. Both are delivered; preserve both boundaries and do not claim shared model access is per-project RBAC. The broader compiler/CDR/editor/governance work remains the next implementation scope.

## Native OIDC increment

Native bearer verification, discovery/JWKS, signed draft-write permissions and tenant storage/session isolation now pass unit, real Git and live identity-provider acceptance. See [OIDC](OIDC.md) and the implementation report. CI also exercises the production HTTP path against a disposable HTTPS issuer. Browser login remains a separate client boundary; ordinary development/server clients keep API keys until deliberately migrated. A bearer token does not establish interactive human approval.

The older isolated identity worktree is retained as historical work; its unfinished fixture and missing discovery are superseded by the accepted implementation. Hosted Git review capabilities are now implemented and tested. SharePoint is now implemented with contract/container evidence; live tenant acceptance needs external credentials. Continue Phase 1 with terminology, structural checks, persisted governance, traceability and QA. Do not resume the old checkpoint as if these repairs were still missing.

## Remaining scope

Complete the partial/unimplemented rows in the matrix: validated modelling engine/OPT compilation, ADL/AQL and composition checks, optional CDR integration using synthetic fixtures, application API/visual modeller, persisted trusted-human governance, native terminology binding preservation and stronger QA/traceability evidence. Enterprise tenant and hosted Designer acceptance need real account access; record that limit without inventing results.

Research identified the Apache-licensed openEHR Archie library for ADL 2/AOM/RM and operational templates, openEHR Java libraries for ADL 1.4, and the openEHR SDK for AQL and composition/template handling. Inspect and pin actual supported APIs/versions before integration. The available CDR's ADL utility is not a substitute for a complete grammar/compiler. Do not edit its unrelated dirty working directory.

For each stage: implement, test, document, commit, push, run `scripts/watch-ci.sh <full-sha>` immediately, fix failures, verify deployment, and continue. Runtime credentials stay outside Git. Preserve both existing model volumes and the old local Git cache.

Hosted repository code reuses generic Git storage and adds six MCP tools. GitHub live acceptance and cleanup are recorded in `evidence/hosted-github-acceptance.json`; GitLab contract tests pass, while live tenant acceptance needs credentials. The current execution queue points to terminology completion.

The terminology protocol increment adds three MCP tools, independent edition evidence, preserved designations and review-only ConceptMap candidates. The managed local catalogue is implemented with repository and offline-operation contracts. Continue with deterministic binding decisions; native inherited-node semantics still require the qualified engine phase. Consult live evidence for provider-specific operation availability.

Binding plans now provide explicit XML inspection, catalogue proposals and revision-bound evidence. Continue Phase 1 governance, traceability, structural/QA and packaging gaps; complete native/inherited binding application with the qualified engine in Phase 2. The authoritative queue is `COMPLETION_QUEUE.json`.
