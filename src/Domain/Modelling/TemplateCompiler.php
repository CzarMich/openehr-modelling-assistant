<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Domain\Modelling;

/** Extension point only. No compiler implementation is shipped or advertised as an MCP operation. */
interface TemplateCompiler
{
    /**
     * @param array<string, string> $archetypes */
    public function compileOpt(string $oet, array $archetypes): string;
}
