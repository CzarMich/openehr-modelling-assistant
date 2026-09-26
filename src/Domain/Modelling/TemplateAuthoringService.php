<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Domain\Modelling;

use DOMDocument;
use OpenEHR\Assistant\Validation\ModelValidator;

final readonly class TemplateAuthoringService
{
    public function __construct(private ArchetypeSource $archetypes, private ModelValidator $validator)
    {
    }

    /** Generate a draft OET with a COMPOSITION and direct ENTRY placements from retrieved archetypes.
     *
     * @param list<string> $entries
     *
     * @return array<string, mixed>
     */
    public function generateOet(string $name, string $composition, array $entries, ?string $ckm = null): array
    {
        if (trim($name) === '' || strlen($name) > 200 || count($entries) > 30 || $entries === []) {
            throw new \InvalidArgumentException('Supply a name and 1–30 entry identifiers.');
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
        foreach ($entries as $identifier) {
            $entry = $this->archetypes->fetch($identifier, $ckm);
            if (!in_array($entry['rm_class'], ['OBSERVATION', 'EVALUATION', 'INSTRUCTION', 'ACTION', 'ADMIN_ENTRY'], true)) {
                throw new \InvalidArgumentException('Only direct ENTRY placements are supported; nested SECTION/CLUSTER authoring requires a modeller.');
            }
            if (isset($sources[$entry['id']])) {
                throw new \InvalidArgumentException('Duplicate archetype placement is not supported by this generator.');
            }
            $node = $document->createElementNS($namespace, 'Content');
            $node->setAttributeNS($xsi, 'xsi:type', $entry['rm_class']);
            $node->setAttribute('archetype_id', $entry['id']);
            $node->setAttribute('path', '/content');
            $definition->appendChild($node);
            $sources[$entry['id']] = $entry['provenance'];
        }
        $xml = $document->saveXML();
        if ($xml === false) {
            throw new \RuntimeException('OET serialization failed.');
        }
        return ['format' => 'oet', 'status' => 'DRAFT', 'content' => $xml,
            'provenance' => $sources, 'validation' => $this->validator->validate($xml, 'oet'),
            'warnings' => ['Direct ENTRY draft only. No slot compatibility, constraints, terminology binding application or OPT compilation has been verified.',
                'Human modelling and clinical review are required before release.']];
    }
}
