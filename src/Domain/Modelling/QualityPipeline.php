<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Domain\Modelling;

use OpenEHR\Assistant\Validation\ModelValidator;

final readonly class QualityPipeline
{
    public function __construct(private ModelValidator $validator)
    {
    }

    /**
     * @return array<string, mixed> */
    public function run(string $content, string $format): array
    {
        $validation = $this->validator->validate($content, $format);
        $steps = [['name' => 'model_preflight', 'status' => $validation['status'], 'report' => $validation]];
        foreach (['archetype_dependency_validation', 'ckm_version_validation', 'terminology_binding_validation',
            'value_set_validation', 'terminology_version_check', 'opt_compilation', 'opt_validation',
            'test_compositions', 'aql_execution', 'requirements_coverage'] as $step) {
            $steps[] = ['name' => $step, 'status' => 'NOT_EXECUTED', 'reason' => 'No applicable verified input or executor supplied to this preflight pipeline.'];
        }
        return ['status' => $validation['valid'] === false ? 'FAIL' : 'INCOMPLETE', 'release_eligible' => false,
            'content_sha256' => hash('sha256', $content), 'steps' => $steps, 'executed_at' => gmdate(DATE_ATOM)];
    }
}
