# Licensing and attribution audit

Audit date: 2026-10-04. Product examined: **openEHR Modelling Assistant**. Starting revision: `704e9cbfef21cc94e76d1706344fb1d39852ff74`. Upstream baseline: `600db3ecb4d5fe3e865393dc4fb976715e475fbe`.

The current product is independently maintained and developed by Michael Anywar.

Copyright © 2026 Michael Anywar.

All rights reserved.

This statement covers only his original work. It does not transfer ownership of other authors' work, change the license of incorporated components, or revoke rights granted in earlier releases.

## Structure and scope

| Location | Purpose |
|---|---|
| `LICENSE` | Reserved-rights terms for Michael Anywar's original product material, with explicit third-party and prior-grant exceptions. |
| `THIRD_PARTY_NOTICES.md` | Complete, verbatim upstream MIT notice; scope of inherited code; bundled model/data attribution; installed dependency notices. |
| `composer.json` | Current product maintainer only; `proprietary` root-package identifier. Dependency metadata in the lockfile remains unchanged. |
| `chat/package.json`, root entry of `chat/package-lock.json` | Current product author, private package, `UNLICENSED` root identifier. Dependency licenses are not changed. |
| `engine/pom.xml` | Current product developer and scoped proprietary license; copies both legal files into the engine JAR's `META-INF/`. Generated SBOMs derive root metadata from this POM; third-party components keep theirs. |
| README, documentation index, in-app Help | Product ownership, scope and links to the terms and notices. |
| PHP, browser and engine images | Both legal files travel with the product at `/app/`; dependency notices remain in installed packages/JARs. |

No blanket proprietary headers were added to source files, inherited guides, models or schemas. No historical commits, authors, tags or co-author trailers were rewritten. New commits for this change use the configured product maintainer without AI co-author attribution. A root package's metadata does not describe the ownership of its dependencies. OCI image/release metadata uses Michael Anywar and `LicenseRef-Proprietary` for the product; bundled components keep their own notices.

## Provenance established before changing notices

The baseline is recorded in the earlier [baseline audit](BASELINE_AUDIT.md) and exists in local Git history. It contains the same complete MIT LICENSE as the starting revision: SHA-256 `4b0d2a1d19b17fe92b1e68a85a6e538f0207bc9047af5301738f1040c3049607`. The notice has been moved, not rewritten. A regression check verifies the exact bytes of its block in THIRD_PARTY_NOTICES.md.

The [upstream inventory](licensing/upstream-inventory.tsv) records baseline paths, baseline Git blobs, current locations, relationships and audited SHA-256 values. It covers 673 surviving inherited paths: 559 unchanged, 113 modified or mixed, and the relocated MIT notice. For the relocated notice, the SHA-256 is the notice text itself. The two obsolete client-tooling files removed in this change are not surviving incorporated material. A modified file is not assumed to be wholly authored by Michael Anywar.

Concrete retained material includes the CKM API client, MCP tools, prompts, resources, completion providers, helpers and tests. All 424 BMM JSON files, all seven bundled ADL archetypes and the terminology XML remain unchanged from the baseline. Of 531 inherited resource files, 529 are unchanged; `resources/server-instructions.md` and `resources/examples/flat/raw_escape_hatch.md` had product changes before this audit. The inherited template guides still contain the CGEM explanation and source credit.

The upstream MIT notice is therefore still applicable. The previous generic thanks to unrelated inspiration, management and tools were not evidence of incorporated source and have been removed from current-product presentation. No additional copyright holder was invented from an acknowledgement.

## Changes made

- Replaced the root-wide MIT presentation with scoped product terms and moved the exact upstream MIT notice into the third-party file.
- Replaced the upstream author in Composer metadata with Michael Anywar as the current owner/maintainer; added matching npm and Maven metadata.
- Removed the README's general acknowledgement paragraph, the third-party file's unscoped inspiration list and organisation-branding attribution, the upstream-host environment suggestion in the issue template, and the obsolete external schema-attribution comment.
- Removed the empty client settings file and redundant `.claude/CLAUDE.md` instructions. The provider adapter, compatible-client documentation and local-secret exclusion rules remain supported.
- Changed the default `PRODUCT_VENDOR` from unrelated organisation branding to Michael Anywar; deployment branding never transfers copyright.
- Updated the historical migration document to distinguish its original MIT arrangement from the current structure. Other dated records remain historical.
- Added ownership and licensing information to Help, the documentation index and contribution/agent instructions. Patch submission is not treated as an automatic copyright assignment.
- Included legal files in all product runtime images and in the native engine JAR. The engine build now uses the repository root context so it consumes the canonical notices rather than divergent copies.

## Files changed

- Product terms and presentation: `LICENSE`, `THIRD_PARTY_NOTICES.md`, `README.md`, `docs/README.md`, `docs/WHITE_LABEL_MIGRATION.md`, `public/chat/index.html`, `CHANGELOG.md`.
- Product metadata and default vendor: `composer.json`, `chat/package.json`, `chat/package-lock.json`, `engine/pom.xml`, `src/Configuration/Settings.php`, `.env.example`, `docs/CONFIGURATION.md`, `docs/DEPLOYMENT.md`.
- Packaging and legal-file verification: `Dockerfile` (also reached through the existing `.docker/Dockerfile` symlink), `chat/Dockerfile`, `engine/Dockerfile`, `.dockerignore`, `deploy/compose.engine.yml`, `tests/fixtures/engine/compose.yml`, `.github/workflows/release.yml`, `.github/workflows/pr-validation.yml`, `scripts/test-engine-container.sh`, `tests/Content/InstallDocContractTest.php`.
- Contributor/tooling presentation: `AGENTS.md`, `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `docs/.sdd.yaml`; deleted `.claude/CLAUDE.md` and `.claude/settings.json`.
- Audit evidence: this report, `docs/licensing/upstream-inventory.tsv` and `docs/licensing/reference-review.tsv`.

## Complete occurrence review

The [classified occurrence inventory](licensing/reference-review.tsv) lists every matching line in tracked text files after the changes for `Cadasto`, `cadasto`, `Claude`, `Anthropic`, `Sebastian`, `copyright`, `Copyright`, `license` and `License` (case-insensitive). Matching is intentionally not restricted to whole words, so package names and configuration identifiers are included. Each row is classified as legal, technical or historical, with a reason. The two inventory files themselves are technical audit evidence: their file paths, hashes and classifications are intentionally retained and are not recursively duplicated into their own output.

| Remaining occurrences | Classification and reason |
|---|---|
| Upstream MIT notice and scoped source identity | Legal: required notice for incorporated application portions. |
| Archetype authors, translators, copyright and license metadata | Legal: original model attribution and CC BY-SA 4.0 terms; unchanged. |
| Installed dependency author/license fields, including PHPUnit's `sebastian/*` names and the Anthropic SDK | Legal/technical: identify the actual third-party packages; never product ownership. |
| Claude provider implementation, authentication/configuration, UI, documentation and tests | Technical: deliberately supported model provider and MCP client. |
| `copyright`/`licence` model-import properties and BMM definitions | Technical: clinical-model provenance or standard field definitions, not product ownership. |
| Product terms, packaging references, legal checks and this report | Technical/legal: implement and explain the requested licensing structure. |
| Dated changelog, baseline evidence, archived plans, superseded ADR | Historical: accurately identify past releases, authors, hosts and test tooling. The ADR is explicitly marked superseded. |
| Git co-author trailers and authors | Historical: already published immutable history; no local unpublished commits were available to amend. |
| Editor fields, `.gitignore` and `.dockerignore` exclusions | Technical: formatting or protection against committing/building local client settings. |
| Negative installation test naming an old hosted endpoint | Technical: verifies deployment independence. |

The audit includes hidden tracked files, source headers, package metadata, generated tool documentation and the checked-in engine SBOM. No separate tracked LICENSE.md, COPYING, NOTICE, pyproject.toml or Cargo.toml was present. Installed `vendor/`, `chat/node_modules/`, engine dependencies and generated local test/build output are dependency or execution material, not product authorship; their original notices are retained. Private environment files, user models, attachments and Git objects were not rewritten. Historical Git metadata was separately searched for AI trailers.

## Matters not established automatically

1. **Earlier releases:** the repository previously distributed the product under MIT. This change cannot withdraw those grants or prevent recipients from using those earlier copies under their original terms. The new terms explicitly preserve that boundary.
2. **Extracted specification snapshots:** BMM files lack embedded per-file source-license/version records. The [BASE repository license](https://github.com/openEHR/specifications-BASE/blob/master/LICENSE) is CC BY-SA 3.0, while [published development specifications](https://specifications.openehr.org/releases/BASE/development/base_types.html) show CC BY-ND 3.0. Git provenance alone does not settle the applicable notice for every extracted JSON or adapted specification passage. The resources and source links are preserved and excluded from proprietary ownership; confirm the exact extraction source and permission before asserting a uniform redistribution license.
3. **CGEM:** the inherited upstream acknowledgement specifies CC-BY but not a version. The [publisher's page](https://freshehr.notion.site/Introduction-to-the-CGEM-Framework-115ed58514b344da825c3b42c372aff2) did not expose an exact license version during this audit. Credit and applicable inherited rights are preserved; no version or new permission is invented.
4. **Binary redistribution:** some dependencies have reciprocal terms, including native image-processing libraries and Jakarta JSON packages. Their notices and original terms remain intact. A particular commercial distribution must meet those packages' source-availability/relinking requirements where applicable; the product's reserved-rights statement is not a substitute for those obligations.

These are specific provenance/distribution limits, not claims that the upstream parties own the independent product. Existing notices were preserved rather than removed on an unverified assumption.

## Validation and repeatability

Run `make ci`, `npm --prefix chat test`, `npm --prefix chat run check:format` and `npm --prefix chat run test:browser`. Local verification passed: 1,235 PHPUnit tests (5,550 assertions), PHPStan, traceability, Composer validation, 151 chat tests, formatting and 53 browser tests. The complete CI workflow additionally builds production/browser/engine images, runs native engine tests, transport/persistence/privacy probes and dependency audits. The content contract checks that the full MIT text survives byte-for-byte and the root metadata names the current maintainer.

Repeat the textual review using `git grep -n -i -E 'cadasto|claude|anthropic|sebastian|copyright|license'`, including hidden tracked files. Inspect any new occurrence in context; never delete dependency notices simply to make the search empty. Regenerate both inventories when the reviewed tree changes; their hashes and line numbers describe this audit, not future revisions.

Primary references: [upstream notice at the inherited commit](https://github.com/cadasto/openehr-assistant-mcp/blob/600db3ecb4d5fe3e865393dc4fb976715e475fbe/LICENSE), [MIT terms](https://opensource.org/license/mit), [Composer package-license metadata](https://getcomposer.org/doc/04-schema.md#license), [npm package-license metadata](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#license). License identification for installed dependencies was also checked against their package metadata and retained notice files.
