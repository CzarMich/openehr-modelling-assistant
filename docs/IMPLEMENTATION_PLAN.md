# Capability completion work

The user has authorized autonomous implementation, testing, documentation, GitHub delivery and deployment of the partial/unimplemented capabilities in `CAPABILITIES.md`. Continue after each successful delivery. Do not relabel an incomplete capability as working.

## Delivered in the Git stage

- Filesystem and generic Git providers, including GitHub/GitLab remotes, native files, history, remote concurrency and offline operation.
- Architecture and shared-repository workflows; optional terminology/bindings.
- Isolated HTTPS development deployment, private Codex credential helper and actual Codex discovery verification.
- Autonomous execution policy and generic user-facing terminology.

## Remaining implementation stages

1. Authenticated identity: OIDC/JWKS validation, issuer/audience/time checks, scoped roles and tested bearer failures. Preserve optional local/API-key modes.
2. Modelling engine: select a maintained openEHR engine for ADL parsing/validation and operational template compilation. Preserve original model content and dependency/version provenance. Integrate real AQL parsing, composition validation and optional CDR execution/deployment with synthetic acceptance tests.
3. Repository integrations: hosted Git review APIs, SharePoint persistence, provider capabilities and real conflict handling. Isolate provider configuration and credentials.
4. Application API and visual modeller: project/artifact authoring, histories/diffs, validation, terminology and requirement links backed by the same domain services.
5. Operational governance: persist review/approval/release records bound to artifact hashes, enforce independent authenticated human approvers, and expose the review UI. A tool call or caller-supplied author field cannot approve a model.
6. Complete terminology/traceability/QA: native binding application/preservation, impact analysis, explicit test evidence and qualified validation stages. Optional integrations must not become mandatory for local modelling.
7. Integration acceptance: CDR with synthetic data, deployed development/server clients, and available enterprise clients. External tenant/account tests require a real available account; record untested external environments explicitly.

## Verification and delivery

Each logical stage includes regression/security/integration tests, updated capability evidence and documentation, a conventional commit, GitHub push, exact-SHA CI monitoring, deployment and live checks. Preserve existing model volumes and unrelated working directories. No secrets or patient data in Git or logs. Compiler/parser completeness must be scoped to supported language versions and demonstrated against authoritative fixtures; code presence is not conformance evidence.
