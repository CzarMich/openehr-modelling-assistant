<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Domain\Terminology;

final readonly class LocalTerminologyProvider implements TerminologyProvider
{
    public function __construct(private ValueSet $valueSet)
    {
        if ($valueSet->source !== 'local') {
            throw new \InvalidArgumentException('External terminology must be verified with its provider.');
        }
    }

    public function lookup(string $system, string $code, ?string $version = null): array
    {
        $matches = array_values(array_filter($this->valueSet->concepts, static fn (array $concept): bool => $concept['code'] === $code));
        $matchesVersion = $version === null || $version === $this->valueSet->version;
        $concept = $system === $this->valueSet->system && $matchesVersion ? ($matches[0] ?? null) : null;
        return ['status' => 'VALIDATED', 'valid' => $concept !== null && !($concept['inactive'] ?? false),
            'concept' => $concept, 'system' => $system, 'code' => $code, 'version' => $this->valueSet->version,
            'provider' => 'local', 'validated_at' => gmdate(DATE_ATOM)];
    }

    public function validateCode(string $system, string $code, ?string $valueSet = null, ?string $version = null): array
    {
        if ($valueSet !== null && $valueSet !== $this->valueSet->id && $valueSet !== $this->valueSet->canonical) {
            return ['status' => 'VALIDATED', 'valid' => false, 'errors' => ['VALUE_SET_NOT_FOUND'], 'provider' => 'local'];
        }
        return $this->lookup($system, $code, $version);
    }

    public function expand(string $valueSet, ?string $version = null, int $count = 50): array
    {
        if (($valueSet !== $this->valueSet->id && $valueSet !== $this->valueSet->canonical)
            || ($version !== null && $version !== $this->valueSet->version)) {
            return ['status' => 'NOT_EXECUTED', 'valid' => null, 'errors' => ['VALUE_SET_OR_VERSION_NOT_FOUND']];
        }
        $items = array_slice($this->valueSet->concepts, 0, max(1, min(500, $count)));
        return ['status' => 'VALIDATED', 'items' => $items, 'total' => count($this->valueSet->concepts),
            'version' => $this->valueSet->version, 'complete' => count($items) === count($this->valueSet->concepts), 'provider' => 'local'];
    }
}
