# Artefact versions

Versioning is on by default. Save an updated template, archetype or other working artefact at the **same repository path**. Changed bytes create a new revision; the selected branch's current file contains the latest saved content. Git retains the earlier content. An unchanged save does not create an extra revision; changes to accompanying metadata or compilation evidence can still create a revision.

For example, successive AKI builds update:

| Artefact | Current path |
|---|---|
| Template source | `AKI/templates/oet/AKI_clinical_documentation.oet` |
| Archetype | `AKI/archetypes/openEHR-EHR-COMPOSITION.encounter.v1.adl` |
| Compiled template | `AKI/templates/opt/AKI_clinical_documentation.opt` |
| Form schema | `AKI/data/json/web-templates/AKI_clinical_documentation.webtemplate.json` |
| Package evidence | `AKI/data/json/template-packages/AKI_clinical_documentation.oet.json` |

There is no timestamp or content-hash suffix on newly generated current files. Outputs previously saved with hash-suffixed names remain available; the next package save creates or updates the stable output paths without deleting older files. Purpose subfolders are retained, so equally named templates in different subfolders have different output paths.

## Finding a version

In **Saved artefacts**, **Open file** follows the branch's current file. **Saved version** and **Copy version link** identify the saved commit. **Version history** opens that file's Git history. A saved SHA-256 fingerprint identifies its exact bytes; it is not a semantic version number or an approval.

The assistant can use `personal_repository_history` for up to 20 recent revisions, then `personal_repository_get` with `ref` to read a particular commit and its SHA-256. Without `ref`, reads use the current branch. Personal connection ownership and upstream access are checked before cached reads. Enterprise model repositories expose `model_artifact_history` and `model_artifact_get(revision=...)`; Git and filesystem providers retain their previous revisions.

## Exact template dependencies

A template, its current archetypes, compiled outputs and dependency manifest are saved together in one commit after native compilation. The change preview shows created, updated and unchanged files, including previous and new hashes. Existing concurrency checks reject stale revisions and intervening branch changes; writes never force-update the branch.

Package schema `openehr-template-package/2` records each archetype's stable path, SHA-256 and immutable Git blob identifiers for SHA-1 and SHA-256 object formats. The selected repository's object format determines the blob identifier used. Model loading verifies both the Git object hash and the expected content SHA-256. Thus template A can keep its exact earlier dependency while template B updates the current archetype file. It does not silently substitute newer CKM content. No duplicate archive files are required, and same-repository project moves preserve these blob references.

Older schema `/1` packages remain readable. If their current dependency file has changed or disappeared, the loader locates the commit that last changed that manifest, verifies its exact manifest bytes, and reads the dependency there. Missing or mismatching historical content fails explicitly. Templates without a package manifest still use their project folder and require native compilation; they have no recorded dependency pin to recover.

`template_compile_project` similarly updates a stable `templates/opt/` path and retains source/dependency revisions and hashes in build metadata. Repeating the same build reuses its revision. A manually owned output or an output belonging to a different source is not silently replaced. Immutable imported originals remain protected; updates belong in working artefacts.

## Modelling and governance

File history is separate from [openEHR archetype/template identification](https://specifications.openehr.org/releases/AM/development/Identification.html). The platform preserves supplied openEHR identifiers; it does not infer a semantic version change from a byte hash. A deliberate modelling change may require an identifier/version decision and updated references. Newly saved or compiled content remains a draft; approvals remain tied to their exact reviewed revision.

## Verification

- `chat/test/template-packages.test.mjs`: GitHub and GitLab updates, unchanged saves, stale writes, stable outputs, previous bytes, shared-archetype pins and legacy package recovery.
- `chat/test/repository-models.test.mjs`: profile access, immutable references, hash checks, missing/tampered inputs and bounded caches.
- `chat/test/personal-workspace.test.mjs`: standalone artefact updates and unchanged-content writes; complete browser change previews and receipts.
- `chat/test/browser.spec.mjs`: current-file, saved-version and version-history links.
- `tests/Enterprise/TemplateBuildsTest.php`: changed builds retain their output path, previous content and evidence for both repository providers and both native output formats.
- `tests/Enterprise/GitRepositoryTest.php`, `tests/Enterprise/RepositoryAndGovernanceTest.php`: durable revisions, unchanged saves, concurrency and historical reads.

These checks use synthetic model artefacts and make no patient-data queries.
