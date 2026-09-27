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
            $tenant = $principal === null ? 'unauthenticated' : $principal->tenant;
            if (!preg_match('/^(?:[a-f0-9]{64}|unauthenticated)$/D', $tenant)) { throw new \InvalidArgumentException('INVALID_TENANT'); }
            $settings = $settings->with(['MODEL_REPOSITORY_PATH' => rtrim($settings->get('MODEL_REPOSITORY_PATH'), '/') . '/tenants/' . $tenant]);
        }
        if (in_array($settings->get('MODEL_REPOSITORY_PROVIDER'), ['git', 'github', 'gitlab'], true)) {
            if ($settings->get('AUTH_MODE') === 'oidc') {
                $remotes = $settings->tenantGitRemotes();
                if ($settings->get('MODEL_GIT_REMOTE_URL') !== '' && $remotes === []) {
                    throw new \InvalidArgumentException('OIDC_TENANT_GIT_REMOTES_REQUIRED');
                }
                if ($principal !== null && $remotes !== [] && !isset($remotes[$principal->tenant])) {
                    throw new \InvalidArgumentException('TENANT_REPOSITORY_NOT_CONFIGURED');
                }
                if ($principal !== null && $settings->get('MODEL_REPOSITORY_PROVIDER') !== 'git' && !isset($remotes[$principal->tenant])) {
                    throw new \InvalidArgumentException('TENANT_REPOSITORY_NOT_CONFIGURED');
                }
                $settings = $settings->with(['MODEL_GIT_REMOTE_URL' => $principal === null ? '' : ($remotes[$principal->tenant] ?? '')]);
            }
            return new GitModelRepository($settings, Hosted\HostedProviderFactory::create($settings));
        }
        if ($settings->get('MODEL_REPOSITORY_PROVIDER') !== 'filesystem') {
            throw new \InvalidArgumentException('REPOSITORY_PROVIDER_NOT_IMPLEMENTED: Use filesystem, git, github or gitlab. SharePoint is not yet implemented.');
        }
        return new FileSystemRepository($settings->get('MODEL_REPOSITORY_PATH'));
    }
}
