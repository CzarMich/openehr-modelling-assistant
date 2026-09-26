# Connecting to openEHR Archetype Designer

[Archetype Designer](https://tools.openehr.org/designer/) can provide the visual modelling workspace alongside the openEHR Modelling Assistant. The integration boundary should be shared model artifacts and their revisions. A direct MCP connection inside the hosted Designer has not been established or verified.

## Recommended repository integration

Use a dedicated model-content GitHub repository, separate from the assistant application's source repository. Designer supports GitHub repositories, including private ones; its developer confirms this in the [repository support discussion](https://discourse.openehr.org/t/setting-up-an-archetype-designer-repository-linked-to-a-private-github-repo/2056/6). Its [GitHub authentication explanation](https://discourse.openehr.org/t/archetype-designer-is-asking-for-access-to-private-github-repos-and-more/5513/3) describes account authorization and repository permissions.

The intended workflow is:

1. Author and visually review models in Designer using the dedicated repository.
2. Read the exact committed model revision through the assistant's repository adapter.
3. Use assistant tools to find CKM content, review requirements and differences, and check terminology through AmyTerm.
4. Propose changes on a separate branch with the expected base revision. Review and merge them before refreshing Designer.
5. Export the needed operational artifacts from Designer and retain the source revision, exported content hash and validation reports together.

The assistant's GitHub repository adapter is **not implemented**. Current `MODEL_REPOSITORY_PROVIDER=filesystem` storage is a versioned JSON snapshot store; it cannot be exposed to Designer by pointing Git at its internal files. Automatic import, pull requests, webhook synchronization, conflict resolution and Designer round-trip tests remain integration work. The user's Designer account must also authorize repository access. This document does not imply that account linking has been performed.

## File exchange with the current tools

An MCP client can read an exported model file and send its content to `model_validate`, `model_diff` or `model_artifact_save`. Store the exact original file, its Designer/source revision and provenance; update artifacts with `expectedRevision` to reject stale writes. Retrieve content with `model_artifact_get` for a reviewed handoff back to a modelling tool.

The assistant can structurally inspect XML, OET and OPT and perform ADL declaration checks. It cannot certify complete openEHR semantics or compile an OPT. Designer's authoring JSON (`.t.json`) must be preserved as its own artifact; do not rename or assume it is an OPT or a lossless interchange format. The [Designer export discussion](https://discourse.openehr.org/t/automatically-convert-webtemplate-t-json-to-opt-format/4885) distinguishes Git-stored authoring artifacts from exported operational templates. Hosted export/automation capabilities must be verified against the actual account before enabling an automated release.

The assistant's draft OET generator is limited to a COMPOSITION and direct ENTRY placements. A successful draft generation is not evidence that Designer imports it without loss. Verify identifiers, cardinalities, languages, annotations, terminology bindings and dependent archetypes on an actual Designer import/export round trip before claiming interoperability.

## Terminology and access

The assistant already calls AmyTerm using a server-side service key. This key stays in its deployment secret store. Do not place it in a GitHub model repository or an externally hosted Designer configuration without verifying the Designer connector's supported authentication and credential handling. A direct Designer-to-AmyTerm connection has not been tested; terminology review through the assistant is available independently.

No public, supported hosted-Designer MCP or automation API was verified in this investigation. Account login pages and internal browser requests are not an integration contract. If a licensed/self-hosted Designer deployment supplies a documented API, implement a separate adapter against that contract and test authentication, concurrency, format preservation and deterministic compiler results.

See [repository capabilities](MODEL_REPOSITORY.md), [terminology](TERMINOLOGY.md), [validation limits](../CAPABILITIES.md) and [tool contracts](MCP_TOOLS.md).
