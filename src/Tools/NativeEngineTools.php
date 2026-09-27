<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Tools;

use Mcp\Capability\Attribute\McpTool;
use Mcp\Capability\Attribute\Schema;
use Mcp\Schema\ToolAnnotations;
use OpenEHR\Assistant\Application\NativeModels;
use OpenEHR\Assistant\Helpers\ToolResult;

final readonly class NativeEngineTools
{
    private const array DEPENDENCY = ['type' => 'object', 'additionalProperties' => false,
        'required' => ['identifier', 'content'], 'properties' => [
            'identifier' => ['type' => 'string', 'minLength' => 2, 'maxLength' => 300],
            'content' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 2097152],
        ]];

    public function __construct(private NativeModels $models)
    {
    }

    /** Validate ADL 2 grammar, AOM constraints and the declared supported RM profile with the configured native engine. Dependencies are explicit exact versions; no network retrieval or approval.
     * @param list<array{identifier: string, content: string}> $dependencies
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'archetype_validate', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function archetype(
        #[Schema(minLength: 1, maxLength: 2097152)] string $content,
        #[Schema(items: self::DEPENDENCY, maxItems: 64)] array $dependencies = []
    ): array {
        return ToolResult::run(fn (): array => $this->models->validate($content, 'adl2', $dependencies));
    }

    /** Validate an ADL 2 template and supplied dependencies using the native engine. Legacy OET XML is a separate format and is rejected here.
     * @param list<array{identifier: string, content: string}> $dependencies
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'template_validate', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function template(
        #[Schema(minLength: 1, maxLength: 2097152)] string $content,
        #[Schema(items: self::DEPENDENCY, maxItems: 64)] array $dependencies = []
    ): array {
        return ToolResult::run(fn (): array => $this->models->validate($content, 'adlt2', $dependencies));
    }

    /** Compile an ADL 2 template into OPT 2 ADL, validate the generated output and return exact input/output hashes. Computation only: no repository write, clinical approval or CDR deployment.
     * @param list<array{identifier: string, content: string}> $dependencies
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'template_compile', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function compile(
        #[Schema(minLength: 1, maxLength: 2097152)] string $content,
        #[Schema(items: self::DEPENDENCY, maxItems: 64)] array $dependencies = []
    ): array {
        return ToolResult::run(fn (): array => $this->models->compile($content, $dependencies));
    }

    /** Validate an OPT 2 ADL document using native flat AOM/RM checks. Legacy OPT XML requires its separate validation profile.
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'opt_validate', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function opt(#[Schema(minLength: 1, maxLength: 2097152)] string $content): array
    {
        return ToolResult::run(fn (): array => $this->models->validate($content, 'opt2'));
    }

    /** Inspect validated native ADL 2 or OPT 2 paths, RM types, multiplicities and terminology. Returns findings when the model cannot be validated; no guessed paths.
     * @param list<array{identifier: string, content: string}> $dependencies
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'model_inspect', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function inspect(
        #[Schema(minLength: 1, maxLength: 2097152)] string $content,
        #[Schema(enum: ['adl2', 'opt2'])] string $format,
        #[Schema(items: self::DEPENDENCY, maxItems: 64)] array $dependencies = []
    ): array {
        return ToolResult::run(fn (): array => $this->models->inspect($content, $format, $dependencies));
    }

    /** Parse AQL with the native ANTLR engine and return its typed syntax tree and normalized query. Model compatibility, path validation and execution remain separate; no CDR is required.
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'aql_validate', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function aql(#[Schema(minLength: 1, maxLength: 2097152)] string $content): array
    {
        return ToolResult::run(fn (): array => $this->models->validate($content, 'aql'));
    }
}
