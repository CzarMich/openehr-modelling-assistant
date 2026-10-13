<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Domain\Modelling;

/** Fixed constraint diagnostics never contain submitted source bytes or credentials. */
final class TemplateInputException extends \InvalidArgumentException
{
    private const array MESSAGES = [
        'DIRECT_INPUT' => 'entries / placements: Supply exactly one of 1–30 direct entries or 1–30 explicit placements.',
        'ENTRY_IDENTIFIER' => 'entries: Direct entry identifiers must be non-empty strings.',
        'DUPLICATE_ENTRY' => 'entries: Duplicate direct archetype placement is not supported by this generator.',
        'ROOT_CLASS' => 'composition: The root archetype must be a COMPOSITION.',
        'ENTRY_CLASS' => 'entries: Direct placements must be ENTRY archetypes.',
        'PLACEMENTS_LIST' => 'placements: Placements must be a list.',
        'PLACEMENT_STRUCTURE' => 'placements: Invalid explicit OET placement. Parents must precede children and paths must be absolute archetype paths.',
        'PARENT_CLASS' => 'placements: Unsupported placement parent RM class.',
        'CHILD_CLASS' => 'placements: The child RM class is not a supported placement for its parent.',
        'DUPLICATE_PATH' => 'placements: Duplicate sibling placement path.',
        'OCCURRENCES' => 'placements: Invalid OET placement occurrence bound.',
        'PLACEMENT_NAME' => 'placements: Invalid OET placement name.',
        'SOURCES_LIST' => 'archetypes: Supply up to 64 exact archetype sources.',
        'SOURCE_SHAPE' => 'archetypes: Each source must contain a string identifier and string ADL content.',
        'SOURCE_IDENTIFIER' => 'archetypes: Source identifier must be a supported openEHR archetype identifier.',
        'SOURCE_DUPLICATE' => 'archetypes: Source identifiers must be unique.',
        'SOURCE_SIZE' => 'archetypes: Each ADL source must not exceed 1 MiB.',
        'SOURCE_NUL' => 'archetypes: ADL content must not contain NUL bytes.',
        'SOURCE_DECLARATION' => 'archetypes: ADL content must begin with an archetype declaration (an initial UTF-8 BOM and leading comments are supported).',
        'SOURCE_MISMATCH' => 'archetypes: Source identifier must match its ADL declaration.',
        'SOURCE_TOTAL' => 'archetypes: Exact archetype sources exceed 6 MiB.',
    ];

    public function __construct(string $constraint, ?int $sourceIndex = null)
    {
        $message = self::MESSAGES[$constraint] ?? 'Input does not meet the documented operation constraints.';
        if ($sourceIndex !== null && $sourceIndex >= 0 && $sourceIndex < 64) {
            $message = str_replace('archetypes:', 'archetypes[' . $sourceIndex . ']:', $message);
        }
        parent::__construct($message);
    }
}
