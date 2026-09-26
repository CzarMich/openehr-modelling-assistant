<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Domain\Repository;

/** Prepared boundary for GitHub/GitLab adapters. No network implementation is shipped. */
interface GitRepository extends ModelRepository
{
    public function createBranch(string $name, string $baseRevision): string;
    /**
     * @return array<string, mixed> */
    public function diff(string $baseRevision, string $headRevision): array;
    public function createReview(string $branch, string $title, string $body): string;
}
