<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Integrations\Repository;

use OpenEHR\Assistant\Configuration\Settings;
use OpenEHR\Assistant\Auth\Principal;
use OpenEHR\Assistant\Domain\Repository\ModelRepository;

final class RepositoryFactory
{
    public static function create(Settings $settings, ?Principal $principal = null): ModelRepository
    {
        if ($settings->get('AUTH_MODE') === 'oidc') {
            // Readiness may construct the registry without credentials. Only authenticated
            // requests execute tools; their tenant selects an isolated repository namespace.
            $tenant = $principal?->tenant ?? 'unauthenticated';
            if (!preg_match('/^(?:[a-f0-9]{64}|unauthenticated)$/D', $tenant)) { throw new \InvalidArgumentException('INVALID_TENANT'); }
            $settings = $settings->with(['MODEL_REPOSITORY_PATH' => rtrim($settings->get('MODEL_REPOSITORY_PATH'), '/') . '/tenants/' . $tenant]);
        }
        if ($settings->get('MODEL_REPOSITORY_PROVIDER') === 'git') {
            if ($settings->get('AUTH_MODE') === 'oidc' && $settings->get('MODEL_GIT_REMOTE_URL') !== '') {
                throw new \InvalidArgumentException('OIDC_SHARED_GIT_TENANT_MAPPING_REQUIRED');
            }
            return new GitModelRepository($settings);
        }
        if ($settings->get('MODEL_REPOSITORY_PROVIDER') !== 'filesystem') {
            throw new \InvalidArgumentException('REPOSITORY_PROVIDER_NOT_IMPLEMENTED: Use filesystem or git. Provider-specific GitHub/GitLab review APIs and SharePoint are not implemented.');
        }
        return new FileSystemRepository($settings->get('MODEL_REPOSITORY_PATH'));
    }
}
