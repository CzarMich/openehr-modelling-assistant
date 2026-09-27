<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Auth;

/** Identity comes from verified transport credentials, never model/tool metadata. */
final readonly class Principal
{
    /** @param list<string> $roles
     * @param list<string> $scopes */
    public function __construct(
        public string $id,
        public string $tenant,
        public array $roles = [],
        public array $scopes = [],
        public bool $human = false,
        public string $method = 'oidc',
    ) {
    }

    /** @param list<string> $roles */
    public function hasRole(array $roles): bool
    {
        return array_intersect($this->roles, $roles) !== [];
    }
}
