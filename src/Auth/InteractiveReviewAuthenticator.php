<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Auth;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use OpenEHR\Assistant\Configuration\Settings;
use OpenEHR\Assistant\Domain\Governance\Actor;
use OpenEHR\Assistant\Domain\Governance\AuditStore;
use Psr\Http\Message\ServerRequestInterface;

/** Purpose-specific assertions from the verified browser session backend; ordinary bearer tokens never qualify. */
final readonly class InteractiveReviewAuthenticator
{
    public function __construct(private Settings $settings, private AuditStore $audit) {}

    public function authenticate(ServerRequestInterface $request): ?Actor
    {
        if ($this->settings->get('GOVERNANCE_ENABLED') !== 'true') { return null; }
        try {
            $authorization = $request->getHeaderLine('Authorization');
            if (!preg_match('/^Bearer ([A-Za-z0-9_.-]{1,16384})$/D', $authorization, $match)) { return null; }
            $token = $match[1]; $parts = explode('.', $token);
            if (count($parts) !== 3) { return null; }
            $header = json_decode(JWT::urlsafeB64Decode($parts[0]), true, 8, JSON_THROW_ON_ERROR);
            if (!is_array($header) || ($header['alg'] ?? null) !== 'HS256' || ($header['typ'] ?? null) !== 'openehr-review+jwt'
                || !is_string($header['kid'] ?? null) || array_diff(array_keys($header), ['alg', 'typ', 'kid']) !== []) { return null; }
            $keys = $this->settings->governanceBrowserKeys(); $key = $keys[$header['kid']] ?? null;
            if ($key === null) { return null; }
            $oldLeeway = JWT::$leeway;
            try { JWT::$leeway = 0; $claims = (array) JWT::decode($token, new Key($key, 'HS256')); }
            finally { JWT::$leeway = $oldLeeway; }
            $now = time();
            if (($claims['iss'] ?? null) !== $this->settings->get('GOVERNANCE_BROWSER_ORIGIN')
                || ($claims['aud'] ?? null) !== 'openehr-modelling-review'
                || ($claims['identity_issuer'] ?? null) !== $this->settings->get('GOVERNANCE_OIDC_ISSUER')
                || !is_string($claims['sub'] ?? null) || $claims['sub'] === '' || strlen($claims['sub']) > 300
                || !is_int($claims['iat'] ?? null) || !is_int($claims['exp'] ?? null) || !is_int($claims['session_started'] ?? null)
                || $claims['iat'] > $now + 5 || $claims['iat'] < $now - 60 || $claims['exp'] <= $claims['iat'] || $claims['exp'] > $claims['iat'] + 60
                || $claims['session_started'] > $claims['iat'] || $claims['session_started'] < $now - (int) $this->settings->get('GOVERNANCE_SESSION_MAX_AGE')
                || ($claims['method'] ?? null) !== $request->getMethod() || ($claims['target'] ?? null) !== $request->getRequestTarget()
                || !is_string($claims['body_sha256'] ?? null) || !hash_equals(hash('sha256', (string) $request->getBody()), $claims['body_sha256'])
                || !is_string($claims['jti'] ?? null)) { return null; }
            $rawRoles = $claims['roles'] ?? null;
            if (!is_array($rawRoles) || !array_is_list($rawRoles) || count($rawRoles) > 100) { return null; }
            foreach ($rawRoles as $role) { if (!is_string($role) || strlen($role) > 200) { return null; } }
            $roles = [];
            foreach ($this->settings->governanceRoleMap() as $role => $accepted) {
                if (array_intersect($rawRoles, $accepted) !== []) { $roles[] = $role; }
            }
            if ($roles === []) { return null; }
            $issuer = $claims['identity_issuer']; $rawTenant = $claims['tenant'] ?? null;
            if (!is_string($rawTenant) || $rawTenant === '' || strlen($rawTenant) > 300) { return null; }
            if ($this->settings->get('AUTH_MODE') === 'oidc') {
                if ($issuer !== $this->settings->get('OIDC_ISSUER')) { return null; }
                if ($this->settings->get('OIDC_TENANT_CLAIM') === '' && $rawTenant !== $issuer) { return null; }
                $allowed = $this->settings->csv('OIDC_ALLOWED_TENANTS');
                if ($allowed !== [] && !in_array($rawTenant, $allowed, true)) { return null; }
                $tenant = Principal::tenantNamespace($issuer, $rawTenant);
            } else {
                // Shared service deployments have one repository namespace, never a caller-selected tenant.
                if ($rawTenant !== $issuer) { return null; }
                $tenant = 'shared';
            }
            $actor = new Actor('oidc:' . hash('sha256', json_encode([$issuer, $rawTenant, $claims['sub']], JSON_THROW_ON_ERROR)),
                $tenant, $roles, true, 'interactive_oidc');
            $this->audit->consumeNonce($claims['jti'], $claims['exp']);
            return $actor;
        } catch (\Throwable) { return null; }
    }
}
