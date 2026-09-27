<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Application;

use OpenEHR\Assistant\Auth\AccessPolicy;
use OpenEHR\Assistant\Domain\Governance\Actor;
use OpenEHR\Assistant\Domain\Repository\ArtifactMetadata;
use OpenEHR\Assistant\Domain\Repository\ModelRepository;

/** A native OPT and its bounded build manifest are saved together in one repository revision. */
final readonly class TemplateBuilds
{
    public function __construct(
        private NativeModels $models,
        private ModelRepository $repository,
        private AccessPolicy $access,
        private Actor $actor
    ) {
    }

    /** @param array<mixed> $dependencies
     * @return array<string, mixed> */
    public function compile(string $project, string $path, string $revision, array $dependencies): array
    {
        $this->access->assertModelWrite();
        if ($revision === '' || !array_is_list($dependencies) || count($dependencies) > 64) {
            throw new \InvalidArgumentException('ENGINE_BUILD_INPUT_INVALID');
        }
        $source = $this->read($project, $path, $revision);
        $documents = [];
        $manifest = [];
        foreach ($dependencies as $item) {
            if (!is_array($item) || array_diff(array_keys($item), ['identifier', 'path', 'revision']) !== []
                || !is_string($item['identifier'] ?? null) || !is_string($item['path'] ?? null)
                || !is_string($item['revision'] ?? null) || $item['revision'] === '') {
                throw new \InvalidArgumentException('ENGINE_BUILD_INPUT_INVALID');
            }
            $artifact = $this->read($project, $item['path'], $item['revision']);
            $documents[] = ['identifier' => $item['identifier'], 'content' => $artifact['content']];
            $manifest[] = ['identifier' => $item['identifier']] + $this->reference($artifact);
        }
        usort($manifest, static fn (array $a, array $b): int => strcmp($a['identifier'], $b['identifier']));
        $result = $this->canonical($this->models->compile($source['content'], $documents));
        if (($result['valid'] ?? false) !== true) {
            return ['saved' => false, 'source' => $this->reference($source), 'report' => $result, 'clinical_approval' => false];
        }
        $output = $result['output'];
        if (strlen($output['content']) > 2097152) {
            throw new \RuntimeException('ENGINE_BUILD_OUTPUT_TOO_LARGE');
        }
        $identity = ['schema' => 1, 'project' => $project, 'source' => $this->reference($source),
            'dependencies' => $manifest, 'engine' => $result['engine'], 'output_sha256' => $output['sha256']];
        $buildId = hash('sha256', json_encode($this->canonical($identity), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
        // Findings and the exact dependency manifest remain evidence. The potentially large
        // inspected tree is reproducible from the native OPT, so is not duplicated in metadata.
        $report = array_intersect_key($result, array_flip(['schema_version', 'operation', 'content_sha256',
            'engine', 'clinical_approval', 'findings', 'profile', 'dependencies', 'identifier', 'rm_release',
            'valid', 'status', 'completed_stage', 'checks', 'terminology_dependencies']));
        $metadata = ['kind' => 'compiled_opt2', 'build' => $identity + ['id' => $buildId,
            'generated_at' => gmdate(DATE_ATOM), 'actor' => $this->actor->evidence(),
            'compiler' => 'Archie', 'format' => $output['format'], 'report' => $report,
            'terminology_validation' => 'NOT_EXECUTED', 'clinical_approval' => false,
            'evidence_trust' => 'Repository build evidence; not a signed attestation or a clinical approval.']];
        ArtifactMetadata::validate($metadata);
        $target = 'templates/compiled/' . $buildId . '.opt';
        try {
            $artifact = $this->repository->saveArtifact($project, $target, $output['content'], $metadata, null);
        } catch (\RuntimeException $error) {
            if ($error->getMessage() !== 'REVISION_CONFLICT') {
                throw $error;
            }
            $artifact = $this->repository->getArtifact($project, $target);
            if ($artifact['content'] !== $output['content'] || ($artifact['metadata']['build']['id'] ?? null) !== $buildId
                || ($artifact['metadata']['build']['source'] ?? null) !== $identity['source']
                || ($artifact['metadata']['build']['dependencies'] ?? null) !== $manifest
                || ($artifact['metadata']['build']['report'] ?? null) !== $report) {
                throw new \RuntimeException('ENGINE_BUILD_CONFLICT');
            }
        }
        return ['saved' => true, 'build_id' => $buildId, 'artifact' => $this->reference($artifact),
            'build' => $artifact['metadata']['build'], 'clinical_approval' => false];
    }

    /** @return array<string, mixed> */
    private function read(string $project, string $path, string $revision): array
    {
        $artifact = $this->repository->getArtifact($project, $path, $revision);
        if (($artifact['status'] ?? null) === 'DELETED' || !is_string($artifact['content'] ?? null)
            || !hash_equals($artifact['sha256'], hash('sha256', $artifact['content']))) {
            throw new \RuntimeException('ENGINE_BUILD_SOURCE_INVALID');
        }
        return $artifact;
    }

    /** @param array<string, mixed> $artifact
     * @return array<string, mixed> */
    private function reference(array $artifact): array
    {
        return array_intersect_key($artifact, array_flip(['path', 'revision', 'sha256', 'provider']));
    }

    /** @param array<mixed> $value
     * @return array<mixed> */
    private function canonical(array $value): array
    {
        if (!array_is_list($value)) {
            ksort($value);
        }
        foreach ($value as &$item) {
            if (is_array($item)) {
                $item = $this->canonical($item);
            }
        }
        return $value;
    }
}
