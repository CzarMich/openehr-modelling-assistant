<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Application;

use OpenEHR\Assistant\Domain\Modelling\QualityPipeline;
use OpenEHR\Assistant\Domain\Repository\ModelRepository;
use OpenEHR\Assistant\Domain\Terminology\ModelTerminologyInspector;
use OpenEHR\Assistant\Domain\Traceability\Graph;
use OpenEHR\Assistant\Validation\Findings;

/** Read-only QA over one exact model revision and its recorded project evidence. */
final readonly class ProjectQuality
{
    public function __construct(
        private ModelRepository $repository,
        private QualityPipeline $pipeline,
        private ProjectTraceability $traceability,
        private ModelTerminologyInspector $terminology
    ) {
    }

    /** @return array<string, mixed> */
    public function evaluate(string $project, string $path, ?string $revision = null, ?string $format = null): array
    {
        $projectRecord = $this->repository->getProject($project);
        $source = $this->repository->getArtifact($project, $path, $revision);
        if (!is_string($source['content'] ?? null)) { throw new \RuntimeException('MODEL_TEXT_FORMAT_REQUIRED'); }
        $format ??= strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $report = $this->pipeline->run($source['content'], $format);
        $findings = new Findings();
        foreach ($report['findings'] as $finding) {
            $findings->add(...$finding);
        }
        $checks = [];
        $sourceEvidence = array_intersect_key($source, array_flip(['path', 'revision', 'sha256', 'status']));
        $integrity = hash_equals(hash('sha256', $source['content']), $source['sha256']);
        $this->check(
            $checks,
            $findings,
            'repository_integrity',
            $integrity,
            'REPOSITORY_HASH_MISMATCH',
            $path,
            'Repository content does not match its recorded hash.',
            $sourceEvidence,
            'Restore or repair the source revision before using its evidence.'
        );
        $this->check(
            $checks,
            $findings,
            'project_active',
            ($projectRecord['status'] ?? '') === 'ACTIVE',
            'PROJECT_ARCHIVED',
            $path,
            'The project is archived.',
            [],
            'Use the supported project lifecycle; retain historical evidence.'
        );
        try {
            $current = $this->repository->getArtifact($project, $path);
            $same = $current['revision'] === $source['revision'] && $current['sha256'] === $source['sha256'];
            $this->check(
                $checks,
                $findings,
                'current_revision',
                $same,
                'REPOSITORY_REVISION_CONFLICT',
                $path,
                'A different current source revision exists.',
                $sourceEvidence,
                'Review the current source and rerun QA on the intended revision.'
            );
        } catch (\RuntimeException|\InvalidArgumentException) {
            $checks[] = ['name' => 'current_revision', 'status' => 'NOT_EXECUTED', 'reason' => 'The current repository revision could not be read.'];
            $findings->add('error', 'REPOSITORY_CURRENT_UNAVAILABLE', $path, 'Current source freshness could not be verified.', $sourceEvidence, 'Resolve the repository error and rerun QA.');
        }
        $provenance = $source['metadata']['provenance'] ?? null;
        $hasProvenance = $this->hasProvenance($provenance);
        $this->check(
            $checks,
            $findings,
            'recorded_provenance',
            $hasProvenance,
            'MISSING_PROVENANCE',
            $path,
            'No source provenance is recorded in artifact metadata.',
            [],
            'Record the source, edition and origin when saving a new draft revision.'
        );
        $trace = $this->trace($project, $sourceEvidence, $checks, $findings);
        try {
            $inspection = $this->terminology->inspect($source['content'], $format);
            $checks[] = ['name' => 'explicit_terminology_inspection', 'status' => $inspection['status'],
                'scope' => $inspection['scope'], 'slots' => count($inspection['slots']), 'qualified' => false];
            foreach ($inspection['findings'] as $finding) {
                $findings->add(...$finding);
            }
            foreach ($inspection['slots'] as $slot) {
                if ($slot['unresolved_literals'] !== [] || ($slot['codings'] === [] && $slot['existing_references'] === [])) {
                    $findings->add('warning', 'UNRESOLVED_TERMINOLOGY', $slot['location'], 'An explicit coded element has unresolved terminology constraints.', [], 'Use the binding planner and retain uncertain mappings for human review.');
                }
            }
        } catch (\RuntimeException|\InvalidArgumentException) {
            $checks[] = ['name' => 'explicit_terminology_inspection', 'status' => 'NOT_EXECUTED', 'reason' => 'The source is unavailable to the configured explicit terminology inspector.'];
            $findings->add('warning', 'TERMINOLOGY_INSPECTION_NOT_EXECUTED', $path, 'Terminology requirements could not be inspected.', [], 'Resolve source/profile findings and rerun the appropriate inspector.');
        }
        foreach (['rm_type_membership', 'duplicate_native_node_identifiers', 'native_path_resolution', 'dependency_versions', 'deprecated_dependencies', 'external_dependency_resolution'] as $check) {
            $checks[] = ['name' => $check, 'status' => 'NOT_EXECUTED', 'reason' => 'Requires the qualified engine and dependency resolver.'];
            $findings->add('warning', 'CHECK_NOT_EXECUTED', $path, 'This model-aware check has not run.', ['check' => $check], 'Resolve dependencies and run the qualified engine before release.');
        }
        return ['status' => $findings->failed() ? 'FAIL' : 'INCOMPLETE', 'release_eligible' => false,
            'source' => $sourceEvidence, 'content_sha256' => $source['sha256'], 'format' => $format,
            'document_validation' => $report['steps'][0]['report'], 'checks' => $checks,
            'traceability' => $trace, 'findings' => $findings->all(), 'model_changed' => false, 'clinical_approval' => false,
            'scope' => 'Exact source/document checks and recorded evidence; provenance and requirement links remain modeller assertions.',
            'consistency' => 'References reflect observed reads, not a distributed repository/audit transaction.', 'executed_at' => gmdate(DATE_ATOM)];
    }

    /** @param array<string, mixed> $source
     * @param list<array<string, mixed>> $checks
     * @return array<string, mixed>|null */
    private function trace(string $project, array $source, array &$checks, Findings $findings): ?array
    {
        try {
            $report = $this->traceability->get($project);
            $graph = new Graph($report['graph']);
        } catch (\RuntimeException|\InvalidArgumentException|\JsonException|\LengthException) {
            $this->check(
                $checks,
                $findings,
                'requirements_traceability',
                false,
                'MISSING_OR_INVALID_TRACEABILITY',
                $source['path'],
                'A valid project requirements graph could not be resolved.',
                [],
                'Create or repair the graph with exact model references.'
            );
            return null;
        }
        $linked = [];
        $modelIds = [];
        $hasRequirement = false;
        foreach ($graph->nodes as $id => $node) {
            if (!isset($node['artifact']) || !$this->sameSource($node['artifact'], $source)) {
                continue;
            }
            $modelIds[] = $id;
            $ancestors = $graph->walk($id, true);
            foreach ($ancestors as $ancestor) {
                if ($graph->nodes[$ancestor]['type'] === 'requirement' && $graph->nodes[$ancestor]['status'] === 'ACTIVE') {
                    $hasRequirement = true;
                }
            }
            $linked = array_merge($linked, $ancestors, $graph->walk($id, false, ['bound_by', 'validated_by', 'reviewed_by']));
        }
        $linked = array_values(array_unique($linked));
        $this->check(
            $checks,
            $findings,
            'recorded_requirements_trail',
            $hasRequirement,
            'MISSING_REQUIREMENT_TRACEABILITY',
            $source['path'],
            'No active requirement trail identifies this exact source revision.',
            [],
            'Record the requirement, decision and exact model element links.'
        );
        $validation = [];
        $reviews = [];
        foreach ($linked as $id) {
            $evidence = $report['evidence'][$id];
            if ($evidence['status'] !== 'VERIFIED' || !$this->sameSource($evidence['source'] ?? [], $source)) {
                continue;
            }
            if ($graph->nodes[$id]['type'] === 'validation_evidence') {
                $validation[$id] = $evidence;
            } elseif ($graph->nodes[$id]['type'] === 'review') {
                $reviews[$id] = $evidence;
            }
        }
        foreach ($report['findings'] as $finding) {
            if (in_array(explode('->', $finding['location'])[0], $linked, true)) {
                $findings->add(...$finding);
            }
        }
        $this->check(
            $checks,
            $findings,
            'recorded_validation_evidence',
            $validation !== [],
            'MISSING_VALIDATION_EVIDENCE',
            $source['path'],
            'No authentic linked validation event was found.',
            [],
            'Run governance validation and link the resulting exact audit event.'
        );
        foreach ($validation as $id => $evidence) {
            if (!$evidence['release_eligible_at_event']) {
                $findings->add('warning', 'VALIDATION_NOT_QUALIFIED', $id, 'The authentic validation event does not qualify the model for release.', ['validation_status' => $evidence['validation_status']], 'Complete every required validation stage and resolve its findings.');
            }
        }
        $checks[] = ['name' => 'recorded_human_review', 'status' => $reviews === [] ? 'NOT_EXECUTED' : 'PASS',
            'scope' => 'Historical authenticated review presence only; this is not a current approval.'];
        if ($reviews === []) {
            $findings->add('warning', 'MISSING_HUMAN_REVIEW', $source['path'], 'No authentic linked human review was found.', [], 'Prepare the exact revision and validation evidence for an independent human reviewer.');
        }
        return ['artifact' => $report['artifact'], 'model_nodes' => $modelIds, 'linked_nodes' => $linked,
            'validation_events' => $validation, 'review_events' => $reviews, 'semantic_satisfaction' => 'NOT_ASSESSED'];
    }

    /** @param list<array<string, mixed>> $checks
     * @param array<string, mixed> $evidence */
    private function check(array &$checks, Findings $findings, string $name, bool $passed, string $code, string $location, string $message, array $evidence, string $remediation): void
    {
        $checks[] = ['name' => $name, 'status' => $passed ? 'PASS' : 'FAIL'];
        if (!$passed) {
            $findings->add('error', $code, $location, $message, $evidence, $remediation);
        }
    }

    /** @param array<string, mixed> $left
     * @param array<string, mixed> $right */
    private function sameSource(array $left, array $right): bool
    {
        foreach (['path', 'revision', 'sha256'] as $key) {
            if (!isset($left[$key], $right[$key]) || $left[$key] !== $right[$key]) {
                return false;
            }
        }
        return true;
    }

    private function hasProvenance(mixed $value, int $depth = 0): bool
    {
        if (is_string($value)) {
            return trim($value) !== '';
        }
        if (is_array($value) && $depth < 16) {
            foreach ($value as $child) {
                if ($this->hasProvenance($child, $depth + 1)) {
                    return true;
                }
            }
        }
        return false;
    }
}
