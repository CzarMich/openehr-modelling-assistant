<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Domain\Modelling;

use DOMDocument;
use DOMElement;
use OpenEHR\Assistant\Validation\ModelValidator;

final readonly class TemplateAuthoringService
{
    public function __construct(private ArchetypeSource $archetypes, private ModelValidator $validator, private ?OpenEhrEngine $engine = null)
    {
    }

    /** Generate a draft OET from direct entries or an explicit, parent-first supported placement tree.
     *
        * @param array<mixed> $entries
        * @param array<mixed> $placements
     *
     * @return array<string, mixed>
     */
    public function generateOet(string $name, string $composition, array $entries, ?string $ckm = null, array $placements = []): array
    {
        if (trim($name) === '' || strlen($name) > 200 || !array_is_list($entries) || !array_is_list($placements)
            || count($entries) > 30 || count($placements) > 30
            || ($entries === []) === ($placements === [])) {
            throw new \InvalidArgumentException('Supply exactly one of 1–30 direct entries or 1–30 explicit placements.');
        }
        foreach ($entries as $identifier) {
            if (!is_string($identifier) || $identifier === '') {
                throw new \InvalidArgumentException('Direct entry identifiers must be non-empty strings.');
            }
        }
        if (count(array_unique($entries)) !== count($entries)) {
            throw new \InvalidArgumentException('Duplicate direct archetype placement is not supported by this generator.');
        }
        $root = $this->archetypes->fetch($composition, $ckm);
        if ($root['rm_class'] !== 'COMPOSITION') {
            throw new \InvalidArgumentException('The root archetype must be a COMPOSITION.');
        }
        $document = new DOMDocument('1.0', 'UTF-8');
        $document->formatOutput = true;
        $namespace = 'openEHR/v1/Template';
        $xsi = 'http://www.w3.org/2001/XMLSchema-instance';
        $template = $document->createElementNS($namespace, 'template');
        $document->appendChild($template);
        foreach (['id' => bin2hex(random_bytes(16)), 'name' => $name] as $key => $value) {
            $element = $document->createElementNS($namespace, $key);
            $element->appendChild($document->createTextNode($value));
            $template->appendChild($element);
        }
        $description = $document->createElementNS($namespace, 'description');
        $description->appendChild($document->createElementNS($namespace, 'lifecycle_state', 'Initial'));
        $template->appendChild($description);
        $definition = $document->createElementNS($namespace, 'definition');
        $definition->setAttributeNS($xsi, 'xsi:type', 'COMPOSITION');
        $definition->setAttribute('archetype_id', $root['id']);
        $template->appendChild($definition);
        $sources = [$root['id'] => $root['provenance']];
        $nativeDependencies = [['identifier' => $root['id'], 'content' => $root['content'], 'sha256' => hash('sha256', $root['content'])]];
        if ($placements !== []) {
            $added = $this->appendPlacements($document, $definition, $root, $placements, $ckm);
            $sources += $added['sources'];
            $nativeDependencies = [...$nativeDependencies, ...$added['dependencies']];
        } else {
            foreach ($entries as $identifier) {
                $entry = $this->archetypes->fetch($identifier, $ckm);
                if (!in_array($entry['rm_class'], ['OBSERVATION', 'EVALUATION', 'INSTRUCTION', 'ACTION', 'ADMIN_ENTRY'], true)) {
                    throw new \InvalidArgumentException('Direct placements must be ENTRY archetypes.');
                }
                if (isset($sources[$entry['id']])) {
                    throw new \InvalidArgumentException('Duplicate direct archetype placement is not supported by this generator.');
                }
                $node = $document->createElementNS($namespace, 'Content');
                $node->setAttributeNS($xsi, 'xsi:type', $entry['rm_class']);
                $node->setAttribute('archetype_id', $entry['id']);
                $node->setAttribute('path', '/content');
                $definition->appendChild($node);
                $sources[$entry['id']] = $entry['provenance'];
                if (!isset($dependencyIds[$entry['id']])) {
                    $dependencyIds[$entry['id']] = true;
                    $nativeDependencies[] = ['identifier' => $entry['id'], 'content' => $entry['content'], 'sha256' => hash('sha256', $entry['content'])];
                }
            }
        }
        $xml = $document->saveXML();
        if ($xml === false) {
            throw new \RuntimeException('OET serialization failed.');
        }
        $nativeCheck = $this->compileCheck($xml, $nativeDependencies);
        $warnings = $placements === []
            ? ['Direct ENTRY draft only. No slot compatibility, constraints or terminology binding application has been verified.']
            : ['Placement paths and structure were supplied explicitly; successful profile compilation does not establish complete legacy AOM semantics.'];
        if (($nativeCheck['status'] ?? '') !== 'PASS') {
            $warnings[] = 'Native compilation was not verified; the draft remains unqualified.';
        }
        $warnings[] = 'Human modelling and clinical review are required before release.';
        return ['format' => 'oet', 'status' => 'DRAFT', 'content' => $xml,
            'dependencies' => $nativeDependencies,
            'provenance' => $sources, 'validation' => $this->validator->validate($xml, 'oet'),
            'placements' => $placements === [] ? 'direct_entries_only' : 'explicit_nested_paths',
            'native_compile_check' => $nativeCheck, 'clinical_approval' => false, 'warnings' => $warnings];
    }

    /** @param array<mixed> $placements
     * @param array{id: string, rm_class: string, content: string, provenance: array<string, mixed>} $root
     * @return array{sources: array<string, array<string, mixed>>, dependencies: list<array{identifier: string, content: string, sha256: string}>} */
    private function appendPlacements(DOMDocument $document, DOMElement $definition, array $root, array $placements, ?string $ckm): array
    {
        if (!array_is_list($placements)) {
            throw new \InvalidArgumentException('Placements must be a list.');
        }
        $parents = ['root' => ['node' => $definition, 'rm_class' => $root['rm_class']]];
        $sources = [];
        $dependencies = [];
        $dependencyIds = [$root['id'] => true];
        $placementPaths = [];
        $sourceHashes = [$root['id'] => hash('sha256', $root['content'])];
        foreach ($placements as $placement) {
            if (!is_array($placement) || array_diff(array_keys($placement), ['id', 'parent', 'identifier', 'path', 'min', 'max', 'name']) !== []
                || !is_string($placement['id'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $placement['id'])
                || isset($parents[$placement['id']]) || !is_string($placement['parent'] ?? null) || !isset($parents[$placement['parent']])
                || !is_string($placement['identifier'] ?? null) || $placement['identifier'] === ''
                || !is_string($placement['path'] ?? null) || strlen($placement['path']) > 2048
                || !preg_match('~^/(?:[a-z][a-z0-9_]*)(?:\[[A-Za-z0-9_.:-]+\])?(?:/[a-z][a-z0-9_]*(?:\[[A-Za-z0-9_.:-]+\])?)*$~D', $placement['path'])) {
                throw new \InvalidArgumentException('Invalid explicit OET placement. Parents must precede children and paths must be absolute archetype paths.');
            }
            $parent = $parents[$placement['parent']];
            [$elementName, $allowedClasses] = match ($parent['rm_class']) {
                'COMPOSITION' => ['Content', ['SECTION', 'OBSERVATION', 'EVALUATION', 'INSTRUCTION', 'ACTION', 'ADMIN_ENTRY']],
                'SECTION' => ['Item', ['SECTION', 'OBSERVATION', 'EVALUATION', 'INSTRUCTION', 'ACTION', 'ADMIN_ENTRY']],
                'OBSERVATION', 'EVALUATION', 'INSTRUCTION', 'ACTION', 'ADMIN_ENTRY' => ['Items', ['CLUSTER', 'ELEMENT']],
                'CLUSTER' => ['Items', ['CLUSTER', 'ELEMENT']],
                default => throw new \InvalidArgumentException('Unsupported placement parent RM class.'),
            };
            $source = $this->archetypes->fetch($placement['identifier'], $ckm);
            if (!in_array($source['rm_class'], $allowedClasses, true)) {
                throw new \InvalidArgumentException('The child RM class is not a supported placement for its parent.');
            }
            $siblingPath = $placement['parent'] . '|' . $placement['path'];
            if (isset($placementPaths[$siblingPath])) {
                throw new \InvalidArgumentException('Duplicate sibling placement path.');
            }
            $placementPaths[$siblingPath] = true;
            $hash = hash('sha256', $source['content']);
            if (isset($sourceHashes[$source['id']]) && !hash_equals($sourceHashes[$source['id']], $hash)) {
                throw new \RuntimeException('ARCHETYPE_SOURCE_REVISION_CHANGED');
            }
            $sourceHashes[$source['id']] = $hash;
            $sources[$source['id']] = $source['provenance'];
            if (!isset($dependencyIds[$source['id']])) {
                $dependencyIds[$source['id']] = true;
                $dependencies[] = ['identifier' => $source['id'], 'content' => $source['content'], 'sha256' => $hash];
            }
            $node = $document->createElementNS('openEHR/v1/Template', $elementName);
            $node->setAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'xsi:type', $source['rm_class']);
            $node->setAttribute('archetype_id', $source['id']);
            $node->setAttribute('path', $placement['path']);
            foreach (['min', 'max'] as $bound) {
                if (isset($placement[$bound])) {
                    $valid = is_string($placement[$bound]) && preg_match($bound === 'min' ? '/^[0-9]+$/D' : '/^(?:[0-9]+|\*)$/D', $placement[$bound]);
                    if (!$valid) {
                        throw new \InvalidArgumentException('Invalid OET placement occurrence bound.');
                    }
                    $node->setAttribute($bound, $placement[$bound]);
                }
            }
            if (isset($placement['name'])) {
                if (!is_string($placement['name']) || trim($placement['name']) === '' || strlen($placement['name']) > 1000) {
                    throw new \InvalidArgumentException('Invalid OET placement name.');
                }
                $node->setAttribute('name', $placement['name']);
            }
            $parent['node']->appendChild($node);
            $parents[$placement['id']] = ['node' => $node, 'rm_class' => $source['rm_class']];
        }
        return ['sources' => $sources, 'dependencies' => $dependencies];
    }

    /** @param list<array{identifier: string, content: string, sha256: string}> $dependencies
     * @return array<string, mixed> */
    private function compileCheck(string $xml, array $dependencies): array
    {
        if ($this->engine === null) {
            return ['status' => 'NOT_EXECUTED', 'reason' => 'No native engine is configured.'];
        }
        try {
            $report = $this->engine->compile($xml, $dependencies);
            return ['status' => ($report['valid'] ?? false) === true ? 'PASS' : 'FAIL',
                'profile' => $report['profile'] ?? 'unknown', 'checks' => $report['checks'] ?? [],
                'findings' => $report['findings'] ?? [], 'limitations' => $report['limitations'] ?? [], 'clinical_approval' => false];
        } catch (\RuntimeException|\InvalidArgumentException $error) {
            if (in_array($error->getMessage(), ['ENGINE_NOT_CONFIGURED', 'ENGINE_UNAVAILABLE', 'ENGINE_BUSY', 'ENGINE_TIMEOUT'], true)) {
                return ['status' => 'NOT_EXECUTED', 'reason' => $error->getMessage()];
            }
            return ['status' => 'FAIL', 'code' => preg_match('/^ENGINE_[A-Z0-9_]{1,70}$/D', $error->getMessage()) ? $error->getMessage() : 'ENGINE_COMPILE_FAILED',
                'clinical_approval' => false];
        }
    }
}
