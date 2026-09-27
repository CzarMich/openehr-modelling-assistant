# Working with Archetype Designer

Use the platform's **Models**, **Chat** and **Governance** tabs in one browser window. The current model browser reads repository files; a dedicated upload/import wizard and governed handoff bundle are not yet implemented. Use a file-capable MCP client or the configured Git repository for file exchange.

1. Export a model using an operation actually available in your Designer account. Preserve its original file and record the tool/version, external revision, filename and hash.
2. Save the original through `model_artifact_save`, including provenance metadata, or commit the unchanged native file to the configured model Git repository. Do not rename authoring JSON into an openEHR format.
3. Retrieve it with `model_artifact_get` and inspect the exact revision in **Models**. Use `model_validate` for the declared XML/OET/OPT profile, or native `archetype_validate`/`template_validate` for ADL 2. Validation levels remain distinct.
4. Make changes only in a new draft with the observed `expectedRevision`. If another modeller changed the model, retrieve that revision and reconcile explicitly. The current XML diff does not establish full semantic equivalence.
5. For an ADL 2 template, supply exact archetype dependencies to `template_compile_project`. Inspect the OPT 2 and build metadata. An OET or `.t.json` source is not accepted by this compiler; its format-specific compiler remains separate work.
6. Prepare the exact revision for human review through **Governance**. Source, findings and review state remain independent. A Git review or compiler success is not clinical approval.
7. Retrieve the intended native revision and confirm its SHA-256 before external import. Select a format your actual Designer account supports. Record which file/revision was transferred; the full automated handoff manifest/receipt service is not yet available.
8. Re-export from Designer and retain it as a separate source revision. Compare identifiers, nodes, constraints, paths, languages, bindings, annotations, slots and dependencies. Unexecuted comparison dimensions remain unverified; report observed losses explicitly.

Git teams can work on a configured branch and use `model_repository_diff` and `model_review_request` where the hosting provider is configured. The assistant's plain model files and sidecar metadata preserve native tool access. Do not place integration credentials in the model repository.

See [compatibility evidence and limits](../ARCHETYPE_DESIGNER_COMPATIBILITY.md), [Git workflow](shared-git-models.md), [compiler deployment](../OPT_COMPILATION.md), and [exchange implementation queue](../EXTERNAL_MODELLING_REQUIREMENTS.json).
