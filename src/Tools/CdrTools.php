<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Tools;

use Mcp\Capability\Attribute\McpTool;
use Mcp\Capability\Attribute\Schema;
use Mcp\Schema\ToolAnnotations;
use OpenEHR\Assistant\Application\AqlWorkbench;
use OpenEHR\Assistant\Application\CdrWorkspace;
use OpenEHR\Assistant\Helpers\ToolResult;

final readonly class CdrTools
{
    private const array MODEL = ['type' => 'object', 'additionalProperties' => false, 'required' => ['identifier', 'content'], 'properties' => [
        'identifier' => ['type' => 'string', 'minLength' => 2, 'maxLength' => 300], 'content' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 2097152]]];

    public function __construct(private CdrWorkspace $cdr, private AqlWorkbench $aql) {}

    /** List the caller's configured CDR connection IDs and safe summaries. Configure credentials in browser Settings; never ask for them in chat.
     *
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'cdr_connection_list', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function connections(): array { return ToolResult::run(fn (): array => $this->cdr->connections()); }

    /** Test an existing connection using a bounded read-only request. Diagnostics contain no credentials or clinical result rows.
     *
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'cdr_connection_test', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: true), outputSchema: ToolResult::SCHEMA)]
    public function test(#[Schema(minLength: 1, maxLength: 64)] string $connection_id): array { return ToolResult::run(fn (): array => $this->cdr->test($connection_id)); }

    /** Describe the adapter's supported read-only operations and bounds; remote availability is verified by connection testing or actual requests.
     *
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'cdr_capabilities', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function capabilities(#[Schema(minLength: 1, maxLength: 64)] string $connection_id): array { return ToolResult::run(fn (): array => $this->cdr->capabilities($connection_id)); }

    /** Explain native AQL syntax, referenced paths and assumptions. Optional exact OPTs enable structural path validation; no query execution.
     *
     * @param list<array{identifier: string, content: string}> $templates
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'aql_explain', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function explain(#[Schema(minLength: 1, maxLength: 65536)] string $query,
        #[Schema(items: self::MODEL, maxItems: 8)] array $templates = []): array { return ToolResult::run(fn (): array => $this->aql->explain($query, $templates)); }

    /** Execute read-only AQL on a configured connection. Returns count/timing only; patient rows are never sent to the assistant. Use Run in the AQL workspace to see results. Bounds are rejected, not clamped; AQL LIMIT must be 1..1000 and excludes API pagination.
     *
     * @param array<string, mixed> $parameters
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'aql_execute', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: true), outputSchema: ToolResult::SCHEMA)]
    public function execute(#[Schema(minLength: 1, maxLength: 64)] string $connection_id,
        #[Schema(minLength: 1, maxLength: 65536)] string $query,
        #[Schema(type: 'object', additionalProperties: ['type' => ['string', 'number', 'boolean', 'null']])] array $parameters = [],
        #[Schema(minimum: 1, maximum: 1000)] int $fetch = 100,
        #[Schema(minimum: 0, maximum: 1000000)] int $offset = 0): array
    { return ToolResult::run(fn (): array => $this->cdr->execute($connection_id, $query, $parameters, $fetch, $offset)); }

    /** List up to 100 executions for this caller, with query text and metadata; no result rows or parameter values.
     *
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'aql_history', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function history(): array { return ToolResult::run(fn (): array => $this->cdr->history()); }

    /** List this caller's saved query text. Query results are never stored with saved queries.
     *
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'aql_saved_list', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function saved(): array { return ToolResult::run(fn (): array => $this->cdr->saved()); }

    /** Read one of this caller's saved queries by ID.
     *
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'aql_saved_get', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function get(#[Schema(minLength: 32, maxLength: 32)] string $id): array { return ToolResult::run(fn (): array => $this->cdr->saved($id)); }

    /** Save query text privately for this caller; no results or credentials. Avoid patient identifiers in saved query literals; use parameters.
     *
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'aql_saved_save', annotations: new ToolAnnotations(readOnlyHint: false, destructiveHint: false, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function save(#[Schema(minLength: 1, maxLength: 100)] string $name, #[Schema(minLength: 1, maxLength: 65536)] string $query,
        #[Schema(minLength: 32, maxLength: 32)] ?string $id = null): array { return ToolResult::run(fn (): array => $this->cdr->saveQuery($name, $query, $id)); }

    /** Build a bounded AQL draft using an exact inspected model and optional exact paths. Compile templates before supplying OPTs. No CDR execution or clinical approval.
     *
     * @param list<string> $paths
     * @param list<array{identifier: string, content: string}> $dependencies
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'model_generate_aql', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function generate(#[Schema(minLength: 1, maxLength: 2097152)] string $content,
        #[Schema(enum: ['opt14', 'opt2', 'adl2'])] string $format,
        #[Schema(items: ['type' => 'string', 'maxLength' => 2048], maxItems: 30)] array $paths = [],
        #[Schema(items: self::MODEL, maxItems: 64)] array $dependencies = []): array
    { return ToolResult::run(fn (): array => $this->aql->generate($content, $format, $paths, $dependencies)); }
}
