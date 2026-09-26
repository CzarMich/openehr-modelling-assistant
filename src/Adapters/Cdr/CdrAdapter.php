<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Adapters\Cdr;

/** Optional connection boundary. No production adapter, credential or CDR is required by the core. */
interface CdrAdapter
{
    /**
     * @return list<string> */
    public function capabilities(): array;
    public function testConnection(): bool;
    /**
     * @return list<array<string, mixed>> */
    public function listTemplates(): array;
    public function getTemplate(string $id): string;
    public function uploadTemplate(string $opt): string;
    /**
     * @param array<string, mixed> $parameters
     * @return array<string, mixed> */
    public function executeAql(string $aql, array $parameters): array;
}
