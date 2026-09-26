<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Validation;

use DOMDocument;
use DOMElement;
use DOMXPath;
use InvalidArgumentException;

/** Bounded structural validation. This is not an ADL parser or an OPT compiler. */
final class ModelValidator
{
    public const string ARCHETYPE_ID = '/^openEHR-[A-Z_]+-[A-Z_]+\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.v[0-9]+(?:\.[0-9]+)*$/D';

    public static function xml(string $content): DOMDocument
    {
        if ($content === '' || strlen($content) > 2097152 || str_contains($content, "\0")
            || preg_match('/<!\s*(DOCTYPE|ENTITY)/i', $content)) {
            throw new InvalidArgumentException('XML_EMPTY_OVERSIZED_OR_UNSAFE: DTDs and entities are prohibited.');
        }
        $previous = libxml_use_internal_errors(true);
        try {
            $document = new DOMDocument();
            $document->resolveExternals = false;
            $document->substituteEntities = false;
            if (!$document->loadXML($content, LIBXML_NONET | LIBXML_NOBLANKS) || $document->doctype !== null) {
                throw new InvalidArgumentException('XML_MALFORMED: unable to parse XML.');
            }
            if ($document->getElementsByTagName('*')->length > 20000) {
                throw new InvalidArgumentException('XML_TOO_COMPLEX: element limit exceeded.');
            }
            return $document;
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    /**
     * @return array<string, mixed> */
    public function validate(string $content, string $format): array
    {
        $errors = [];
        $warnings = [];
        $executed = [];
        $full = $format === 'xml';
        if (in_array($format, ['xml', 'oet', 'opt'], true)) {
            try {
                $document = self::xml($content);
                $executed[] = 'secure_xml_parse';
                if ($format !== 'xml') {
                    $root = $document->documentElement;
                    $namespace = $format === 'oet' ? 'openEHR/v1/Template' : 'http://schemas.openehr.org/v1';
                    if (!$root || $root->localName !== 'template' || $root->namespaceURI !== $namespace) {
                        $errors[] = 'Unexpected template root or namespace for ' . $format . '.';
                    } else {
                        $xpath = new DOMXPath($document);
                        $xpath->registerNamespace('t', $namespace);
                        foreach ($format === 'oet' ? ['id', 'name', 'definition'] : ['template_id', 'definition', 'language', 'description'] as $name) {
                            $nodes = $xpath->query('/t:template/t:' . $name);
                            if ($nodes === false || $nodes->length !== 1) {
                                $errors[] = 'Exactly one ' . $name . ' element is required by this structural profile.';
                            }
                        }
                        foreach ($document->getElementsByTagName('*') as $node) {
                            if ($node->hasAttribute('archetype_id') && !preg_match(self::ARCHETYPE_ID, $node->getAttribute('archetype_id'))) {
                                $errors[] = 'Invalid archetype identifier.';
                            }
                            foreach (['min', 'max'] as $bound) {
                                if ($node->hasAttribute($bound) && !preg_match($bound === 'min' ? '/^\d+$/D' : '/^(\d+|\*)$/D', $node->getAttribute($bound))) {
                                    $errors[] = 'Invalid occurrence bound.';
                                }
                            }
                            if ($node->hasAttribute('min') && $node->hasAttribute('max') && $node->getAttribute('max') !== '*'
                                && (int) $node->getAttribute('min') > (int) $node->getAttribute('max')) {
                                $errors[] = 'Minimum occurrence exceeds maximum.';
                            }
                            if ($node->localName === 'Rule' && !str_starts_with($node->getAttribute('path'), '/')) {
                                $errors[] = 'Rule requires an absolute path relative to its archetype.';
                            }
                        }
                        $executed[] = $format . '_structural_profile';
                    }
                    $warnings[] = 'No schema, RM conformance, archetype dependency, node-path or clinical validation was performed.';
                    $warnings[] = 'OPT compilation is not configured. Structural checks do not establish deployability.';
                }
            } catch (InvalidArgumentException $e) {
                $errors[] = $e->getMessage();
            }
        } elseif ($format === 'adl') {
            $executed[] = 'adl_header_preflight';
            if (strlen($content) > 2097152 || !preg_match('/\barchetype\b[\s\S]*?\b(openEHR-[^\s]+)\s/', $content, $matches)
                || !preg_match(self::ARCHETYPE_ID, $matches[1])) {
                $errors[] = 'No supported ADL archetype declaration and identifier found.';
            }
            foreach (['language', 'description', 'definition', 'ontology'] as $section) {
                if (!preg_match('/^\s*' . $section . '\b/m', $content)) {
                    $warnings[] = 'ADL 1.4 preflight did not find section: ' . $section;
                }
            }
            $warnings[] = 'No ADL grammar, RM, slots, terminology or semantic validation was executed.';
        } elseif ($format === 'aql') {
            $warnings[] = 'AQL parser and execution adapter are not configured. Use the AQL design/review prompts.';
        } else {
            throw new InvalidArgumentException('Unsupported validation format.');
        }
        return ['valid' => $errors !== [] ? false : ($full ? true : null),
            'status' => $errors !== [] ? 'INVALID' : ($full ? 'VALIDATED' : ($executed === [] ? 'NOT_EXECUTED' : 'PARTIAL')),
            'structurally_valid' => $executed === [] ? null : $errors === [], 'deterministic' => true,
            'scope' => $format === 'xml' ? 'xml_well_formedness' : $format . '_preflight',
            'validator' => 'openehr-assistant-structural/1', 'executed_checks' => $executed,
            'errors' => array_values(array_unique($errors)), 'warnings' => $warnings,
            'content_sha256' => hash('sha256', $content), 'validated_at' => gmdate(DATE_ATOM)];
    }

    /** Semantic structural projection; addresses use parent placement + path + archetype, never XML order.
     *
     * @return array<string, array<string, mixed>>
     */
    public function projection(string $content): array
    {
        $document = self::xml($content);
        $result = [];
        $walk = function (DOMElement $element, string $parent) use (&$walk, &$result): void {
            $identity = $element->getAttribute('path') . '|' . $element->getAttribute('archetype_id');
            $key = $parent . '/' . $element->localName . '[' . $identity . ']';
            // Keep duplicate placements explicit rather than silently overwriting them.
            $base = $key;
            $n = 1;
            while (isset($result[$key])) {
                $key = $base . '#' . ++$n;
            }
            $attributes = [];
            foreach ($element->attributes as $attribute) {
                $attributes[$attribute->nodeName] = $attribute->nodeValue;
            }
            ksort($attributes);
            $text = '';
            foreach ($element->childNodes as $child) {
                if ($child instanceof \DOMText) {
                    $text .= $child->wholeText;
                }
            }
            $result[$key] = ['attributes' => $attributes, 'text' => trim($text)];
            foreach ($element->childNodes as $child) {
                if ($child instanceof DOMElement) {
                    $walk($child, $key);
                }
            }
        };
        if ($document->documentElement !== null) {
            $walk($document->documentElement, '');
        }
        return $result;
    }

    /**
     * @return array<string, mixed> */
    public function diff(string $before, string $after): array
    {
        $a = $this->projection($before);
        $b = $this->projection($after);
        $changed = [];
        foreach (array_intersect_key($a, $b) as $path => $value) {
            if ($value !== $b[$path]) {
                $changed[$path] = ['before' => $value, 'after' => $b[$path]];
            }
        }
        return ['scope' => 'xml_structure_attributes_and_leaf_values', 'added' => array_diff_key($b, $a),
            'removed' => array_diff_key($a, $b), 'changed' => $changed,
            'limitations' => ['Not full openEHR semantic equivalence; renamed placements appear as removal and addition.']];
    }
}
