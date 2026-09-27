# Continuation handoff

The user requested a pause after publishing the verified capability update, with the remaining implementation to resume in the next session. The [autonomous execution policy](AUTONOMOUS_EXECUTION_POLICY.md) remains in force; no routine development or delivery confirmation is needed. Resume the [implementation plan](IMPLEMENTATION_PLAN.md), keeping terminology/bindings optional and using generic user-facing names: terminology server, server and CDR.

## Accepted work

- Filesystem and Git ModelRepository providers, private hosted remotes, revision conflict handling and native files.
- Configurable Git content root and category/flat layouts for authoring repositories; Unicode filenames.
- Authenticated development HTTPS endpoint and actual local Codex discovery verification.
- Shared private model repository with scoped SSH credentials and bidirectional native-file tests.
- Architecture/workflow updates, capability evidence and metadata schema regression fix.

The capability matrix describes shipped code, not work in an isolated branch. Hosted Designer login/account authorization is still unavailable; Git interoperability does not establish a visual round trip. Do not claim that connection is complete.

## Browser chat follow-up delivered

The user subsequently requested an actual browser chat, so that feature was implemented as a separate Node MCP client. See [browser chat](BROWSER_CHAT.md). Browser OIDC sign-in and conversation ownership are separate from the saved native MCP bearer-verification branch below. Merge this chat delivery into that branch before continuing; do not remove either identity boundary or claim shared model access is per-project RBAC. The broader compiler/CDR/editor/governance work remains the next implementation scope.

## Saved OIDC work in progress

The isolated worktree is `/home/hyq/workspace/openehr-modelling-assistant-identity`, branch `feat/oidc-identity`. Local checkpoint commit: `97085c3`. It is intentionally not pushed, deployed or merged. Its Docker test container is `openehr-modelling-identity-tests`.

Implemented but not accepted yet: a maintained JWT dependency, pinned issuer/audience/JWKS verifier, bounded key refresh, signed scopes/roles/tenant claims, write authorization, tenant-isolated filesystem/local Git storage, and HTTP wiring. Security tests cover forged signatures, wrong claims, key rotation, role checks and tenant isolation.

First unfinished check: the test fixture passes an uninitialized typed static string by reference to `openssl_pkey_export`. Initialize the fixture property before running the security tests; then fix any actual failures and run full regression/static checks. The last failed test output is `/tmp/openehr-identity-tests.log`. Do not mark OIDC working based on code presence.

Merge the completed shared-repository changes into this branch before continuing. Reconcile the project-service metadata schema and discovery cache changes. Extend tenant isolation to remote Git using the now-available content-root mapping (or explicitly configured isolated remotes); the provisional shared-remote rejection is intentional until that mapping is tested. Validate real identity-provider tokens without exposing credentials. Keep the existing API-key deployments working.

## Remaining scope

Complete the partial/unimplemented rows in the matrix: validated modelling engine/OPT compilation, ADL/AQL and composition checks, optional CDR integration using synthetic fixtures, hosted Git reviews, SharePoint storage, application API/visual modeller, persisted trusted-human governance, native terminology binding preservation and stronger QA/traceability evidence. Enterprise tenant and hosted Designer acceptance need real account access; record that limit without inventing results.

Research identified the Apache-licensed openEHR Archie library for ADL 2/AOM/RM and operational templates, openEHR Java libraries for ADL 1.4, and the openEHR SDK for AQL and composition/template handling. Inspect and pin actual supported APIs/versions before integration. The available CDR's ADL utility is not a substitute for a complete grammar/compiler. Do not edit its unrelated dirty working directory.

For each stage: implement, test, document, commit, push, run `scripts/watch-ci.sh <full-sha>` immediately, fix failures, verify deployment, and continue. Runtime credentials stay outside Git. Preserve both existing model volumes and the old local Git cache.
