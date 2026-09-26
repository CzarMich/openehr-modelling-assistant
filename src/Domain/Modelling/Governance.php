<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Domain\Modelling;

/** Pure policy boundary. Trusted human identity must come from an authenticated application, never model content. */
final class Governance
{
    public const array TRANSITIONS = [
        'DRAFT' => ['IN_REVIEW'], 'IN_REVIEW' => ['CHANGES_REQUESTED', 'VALIDATED'],
        'CHANGES_REQUESTED' => ['DRAFT'], 'VALIDATED' => ['APPROVED', 'CHANGES_REQUESTED'],
        'APPROVED' => ['RELEASED', 'CHANGES_REQUESTED'], 'RELEASED' => ['DEPRECATED'], 'DEPRECATED' => [],
    ];

    /**
     * @param array<string, mixed> $validation
     * @param list<string> $roles */
    public function assertTransition(string $from, string $to, string $author, string $actor, bool $human, array $roles, array $validation, string $contentHash): void
    {
        if (!in_array($to, self::TRANSITIONS[$from] ?? [], true)) {
            throw new \DomainException('GOVERNANCE_INVALID_TRANSITION');
        }
        if (in_array($to, ['VALIDATED', 'APPROVED', 'RELEASED'], true)
            && (($validation['status'] ?? '') !== 'VALIDATED' || ($validation['valid'] ?? null) !== true
                || ($validation['release_eligible'] ?? false) !== true || ($validation['content_sha256'] ?? '') !== $contentHash)) {
            throw new \DomainException('GOVERNANCE_VALIDATION_REQUIRED');
        }
        if (in_array($to, ['APPROVED', 'RELEASED'], true)
            && (!$human || $actor === '' || $actor === $author || !in_array('approver', $roles, true))) {
            throw new \DomainException('GOVERNANCE_INDEPENDENT_HUMAN_APPROVAL_REQUIRED');
        }
    }
}
