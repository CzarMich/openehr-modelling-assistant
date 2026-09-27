# Third-party notices

This product derives from [Cadasto's openEHR Assistant MCP](https://github.com/cadasto/openehr-assistant-mcp), via [CzarMich's fork](https://github.com/CzarMich/openehr-assistant-mcp).
The upstream MIT notice, copyright (c) 2025 Cadasto B.V., is preserved verbatim in
[LICENSE](LICENSE). Configurable EY branding identifies a derived distribution;
it does not attribute upstream authorship to EY or imply security approval.

Upstream acknowledgements: Sebastian Iancu; the Python openEHR MCP project
(deak-ai/openehr-mcp-server); Seref Arikan; Sidharth Ramesh; the PHP Foundation
and Symfony MCP SDK contributors; Ocean Health Systems CKM; freshEHR CGEM
(CC-BY attribution retained in the template guide); Silje Ljosland Bakke.

Bundled openEHR specifications, examples and terminology retain their source
attributions. Composer dependencies retain their own licences in the installed
`vendor/` tree; run `composer licenses` to inspect the locked dependency inventory.
No SNOMED CT, LOINC or other restricted external terminology database is bundled.
External terminology responses must be used under the source's applicable terms.

## Optional browser chat

The chat runtime uses Node.js (MIT and bundled notices), openid-client and oauth4webapi (MIT), and the pinned OpenAI Codex distribution (Apache-2.0 and its bundled third-party notices). Playwright (Apache-2.0) and Prettier (MIT) are development dependencies. Package lockfiles and the chat Dockerfile record versions. No provider trademark implies endorsement.
