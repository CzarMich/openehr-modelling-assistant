<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Tools;

use Mcp\Capability\Attribute\McpTool;
use Mcp\Capability\Attribute\Schema;
use Mcp\Schema\ToolAnnotations;
use OpenEHR\Assistant\Domain\Modelling\TemplateAuthoringService;
use OpenEHR\Assistant\Domain\Modelling\QualityPipeline;
use OpenEHR\Assistant\Helpers\ToolResult;
use OpenEHR\Assistant\Validation\ModelValidator;

final readonly class ModelService
{
    public function __construct(private ModelValidator $validator, private TemplateAuthoringService $authoring, private QualityPipeline $qa)
    {
    }

    /** Run deterministic bounded preflight checks. Partial results never certify deployment.
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'model_validate', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function validate(#[Schema(maxLength: 2097152)] string $content, #[Schema(enum: ['xml', 'oet', 'opt', 'adl', 'aql', 'flat', 'structured'])] string $format): array
    {
        return ToolResult::run(fn (): array => $this->validator->validate($content, $format));
    }

    /** Compare XML placements, constraints and leaf values. Not full openEHR semantic equivalence.
     * @return array<string, mixed> */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'model_diff', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function diff(#[Schema(maxLength: 2097152)] string $before, #[Schema(maxLength: 2097152)] string $after): array
    {
        return ToolResult::run(fn (): array => $this->validator->diff($before, $after));
    }

    /** Generate a draft OET from a retrieved COMPOSITION and 1–30 direct ENTRY archetypes. No OPT compiler or semantic certification.
     *
     * @param list<string> $entries
     * @return array<string, mixed>
     */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'template_build_oet', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: true), outputSchema: ToolResult::SCHEMA)]
    public function buildOet(#[Schema(minLength: 1, maxLength: 200)] string $name, string $composition,
        #[Schema(items: ['type' => 'string'], minItems: 1, maxItems: 30, uniqueItems: true)] array $entries, ?string $ckm = null): array
    {
        return ToolResult::run(fn (): array => $this->authoring->generateOet($name, $composition, $entries, $ckm));
    }

    /** Run the modelling QA preflight. Missing validators and checks are NOT_EXECUTED; release eligibility stays false.
     *
     * @return array<string, mixed>
     */
    #[Schema(additionalProperties: false)]
    #[McpTool(name: 'model_qa', annotations: new ToolAnnotations(readOnlyHint: true, openWorldHint: false), outputSchema: ToolResult::SCHEMA)]
    public function qa(#[Schema(maxLength: 2097152)] string $content, #[Schema(enum: ['xml', 'oet', 'opt', 'adl', 'aql', 'flat', 'structured'])] string $format): array
    {
        return ToolResult::run(fn (): array => $this->qa->run($content, $format));
    }
}
