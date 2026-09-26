# White-label migration

The working directory, repository name, Composer identity, PHP namespaces, MCP server identity, Compose services and documentation now use openEHR Modelling Assistant. Product name, vendor, description, links and icon are deployment settings. Core code has no required model-provider SDK, client plugin, hosted upstream service or CDR.

The MIT LICENSE remains byte-for-byte unchanged. THIRD_PARTY_NOTICES preserves the upstream author/company and fork history. Clinical guides, 14 prompts, specification data, examples and legacy tool contracts remain available. The former install test requiring an upstream hosted URL was replaced with an independent-deployment contract; this intentional product change is recorded in ADR-0008.

Remaining upstream-name occurrences are limited to these purposes:

| Location | Reason retained |
|---|---|
| LICENSE and THIRD_PARTY_NOTICES.md | Required legal copyright and attribution |
| CHANGELOG.md | Historical releases and contributors |
| docs/BASELINE_AUDIT.md and docs/evidence/baseline* | Original source identity and measured baseline |
| docs/decisions/0007-website-in-separate-repository.md | Superseded historical decision, visibly marked |
| docs/plans/archive/* | Historical design/review links and code samples |
| tests/Content/InstallDocContractTest.php | Negative assertion against a former hosted hostname |
| tests/Resources/SpecDigestsTest.php | Reference to an original plan filename |
| docs/.sdd.yaml | Historical descriptor-format attribution, not a runtime integration |

Repeat the audit with `rg -n -i 'cadasto|openehr-assistant-mcp' --hidden --glob '!.git/**' --glob '!vendor/**'`. Investigate any occurrence outside legal, historical or negative-test contexts. No upstream image, favicon, plugin repository or hosted endpoint is needed to deploy this product.
