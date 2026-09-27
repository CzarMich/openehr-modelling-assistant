<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Domain\Modelling;

/** Legacy pre-engine extension contract. New integrations use OpenEhrEngine and its evidence-rich results. */
interface TemplateCompiler
{
    /**
     * @param array<string, string> $archetypes */
    public function compileOpt(string $oet, array $archetypes): string;
}
