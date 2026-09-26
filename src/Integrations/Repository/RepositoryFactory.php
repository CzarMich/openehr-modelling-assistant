<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Integrations\Repository;

use OpenEHR\Assistant\Configuration\Settings;
use OpenEHR\Assistant\Domain\Repository\ModelRepository;

final class RepositoryFactory
{
    public static function create(Settings $settings): ModelRepository
    {
        if ($settings->get('MODEL_REPOSITORY_PROVIDER') !== 'filesystem') {
            throw new \InvalidArgumentException('REPOSITORY_PROVIDER_NOT_IMPLEMENTED: GitHub, GitLab and SharePoint are prepared extension points only.');
        }
        return new FileSystemRepository($settings->get('MODEL_REPOSITORY_PATH'));
    }
}
