<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Configuration;

use InvalidArgumentException;

/** Deployment configuration, independent of modelling services. */
final class Settings
{
    public const array DEFAULTS = [
        'APP_ENV' => 'development', 'PRODUCT_NAME' => 'openEHR Modelling Assistant',
        'PRODUCT_SHORT_NAME' => 'openEHR Modelling Assistant', 'PRODUCT_VENDOR' => 'EY',
        'PRODUCT_DESCRIPTION' => 'AI-assisted openEHR modelling and knowledge services',
        'PRODUCT_URL' => '', 'PRODUCT_SUPPORT_URL' => '', 'PRODUCT_DOCUMENTATION_URL' => '',
        'PRODUCT_LOGO_URL' => '', 'MCP_SERVER_NAME' => 'openehr-modelling-assistant',
        'MCP_TRANSPORT' => 'streamable-http', 'MCP_HOST' => '127.0.0.1', 'MCP_PORT' => '8343',
        'MCP_ALLOWED_HOSTS' => 'localhost,127.0.0.1,[::1]', 'CORS_ALLOWED_ORIGINS' => '',
        'AUTH_MODE' => 'none', 'AUTH_API_KEY' => '', 'AUTH_API_KEY_HEADER' => 'X-API-Key',
        'OIDC_ISSUER' => '', 'OIDC_AUDIENCE' => '', 'OIDC_JWKS_URI' => '',
        'OIDC_CLOCK_SKEW' => '60', 'OIDC_MAX_TOKEN_AGE' => '7200', 'OIDC_ALLOWED_CLIENT_IDS' => '',
        'OIDC_REQUIRED_SCOPES' => 'modelling.read', 'OIDC_ROLES_CLAIM' => 'roles', 'OIDC_REQUIRED_ROLES' => '',
        'OIDC_WRITE_ROLES' => 'modeller,administrator', 'OIDC_TENANT_CLAIM' => '', 'OIDC_ALLOWED_TENANTS' => '',
        'OIDC_TENANT_GIT_REMOTES' => '{}',
        'CKM_API_BASE_URL' => 'https://ckm.openehr.org/ckm/rest/', 'CKM_TIMEOUT' => '15',
        'CKM_SOURCES' => '{}', 'CKM_DEFAULT_SOURCE' => 'default',
        'TERMINOLOGY_FHIR_BASE_URL' => '', 'TERMINOLOGY_BEARER_TOKEN' => '',
        'TERMINOLOGY_API_KEY' => '', 'TERMINOLOGY_API_KEY_HEADER' => 'X-API-Key',
        'TERMINOLOGY_CODESYSTEM_VALIDATE_PARAMETER' => 'url',
        'HTTP_TIMEOUT' => '15', 'HTTP_SSL_VERIFY' => 'true', 'HTTP_CA_BUNDLE' => '',
        'MAX_REQUEST_BYTES' => '2097152', 'MAX_UPSTREAM_BYTES' => '8388608',
        'LOG_LEVEL' => 'info', 'MODEL_REPOSITORY_PROVIDER' => 'filesystem',
        'MODEL_REPOSITORY_PATH' => '/tmp/openehr-models', 'MODEL_REPOSITORY_WRITE_ENABLED' => 'false',
        'MODEL_GIT_LAYOUT' => 'categories', 'MODEL_GIT_CONTENT_PATH' => '', 'MODEL_GIT_REMOTE_URL' => '', 'MODEL_GIT_BRANCH' => 'main', 'MODEL_GIT_SYNC_SECONDS' => '5',
        'MODEL_GIT_TIMEOUT' => '30', 'MODEL_GIT_AUTHOR_NAME' => 'openEHR Modelling Assistant',
        'MODEL_GIT_AUTHOR_EMAIL' => 'modelling-assistant@localhost',
        'MODEL_HOSTED_API_URL' => '', 'MODEL_HOSTED_TOKEN' => '', 'MODEL_GIT_REVIEW_TARGET' => 'main',
        'MODEL_GIT_SSH_KEY_FILE' => '', 'MODEL_GIT_KNOWN_HOSTS_FILE' => '',
    ];

    /** @var array<string, string> */
    private array $values;

    /**
     * @param array<string, string> $overrides */
    public function __construct(array $overrides = [])
    {
        $this->values = array_replace(self::DEFAULTS, $overrides);
        foreach (['MCP_TRANSPORT' => ['stdio', 'streamable-http'], 'AUTH_MODE' => ['none', 'api_key', 'oidc'],
            'APP_ENV' => ['development', 'testing', 'production'],
            'MODEL_GIT_LAYOUT' => ['categories', 'flat'],
            'TERMINOLOGY_CODESYSTEM_VALIDATE_PARAMETER' => ['url', 'system'],
            'LOG_LEVEL' => ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'],
            'MODEL_REPOSITORY_PROVIDER' => ['filesystem', 'git', 'github', 'gitlab', 'sharepoint']] as $key => $allowed) {
            if (!in_array($this->get($key), $allowed, true)) {
                throw new InvalidArgumentException("Invalid configuration: $key.");
            }
        }
        foreach (['HTTP_TIMEOUT', 'CKM_TIMEOUT', 'MAX_REQUEST_BYTES', 'MAX_UPSTREAM_BYTES', 'MCP_PORT', 'MODEL_GIT_TIMEOUT'] as $key) {
            if (!ctype_digit($this->get($key)) || (int) $this->get($key) < 1) {
                throw new InvalidArgumentException("$key must be a positive integer.");
            }
        }
        if (!ctype_digit($this->get('MODEL_GIT_SYNC_SECONDS')) || (int) $this->get('MODEL_GIT_SYNC_SECONDS') > 300 || (int) $this->get('MODEL_GIT_TIMEOUT') > 120) {
            throw new InvalidArgumentException('Git sync must be 0..300 seconds and timeout 1..120 seconds.');
        }
        if (!ctype_digit($this->get('OIDC_CLOCK_SKEW')) || (int) $this->get('OIDC_CLOCK_SKEW') > 120
            || !ctype_digit($this->get('OIDC_MAX_TOKEN_AGE')) || (int) $this->get('OIDC_MAX_TOKEN_AGE') < 60 || (int) $this->get('OIDC_MAX_TOKEN_AGE') > 86400) {
            throw new InvalidArgumentException('Invalid OIDC clock or token age configuration.');
        }
        if ((int) $this->get('MCP_PORT') > 65535) {
            throw new InvalidArgumentException('MCP_PORT must be <= 65535.');
        }
        foreach (['HTTP_SSL_VERIFY', 'MODEL_REPOSITORY_WRITE_ENABLED'] as $key) {
            if (!in_array($this->get($key), ['true', 'false'], true)) {
                throw new InvalidArgumentException("$key must be true or false.");
            }
        }
        if ($this->get('HTTP_SSL_VERIFY') !== 'true') {
            throw new InvalidArgumentException('TLS verification cannot be disabled. Configure HTTP_CA_BUNDLE.');
        }
        if ($this->get('AUTH_MODE') === 'api_key' && strlen($this->get('AUTH_API_KEY')) < 32) {
            throw new InvalidArgumentException('AUTH_API_KEY must contain at least 32 characters.');
        }
        if (!preg_match('/^[A-Za-z][A-Za-z0-9-]*$/D', $this->get('AUTH_API_KEY_HEADER')) || !preg_match('/^[A-Za-z][A-Za-z0-9-]*$/D', $this->get('TERMINOLOGY_API_KEY_HEADER'))) {
            throw new InvalidArgumentException('Invalid AUTH_API_KEY_HEADER.');
        }
        foreach (['MODEL_HOSTED_API_URL', 'CKM_API_BASE_URL', 'TERMINOLOGY_FHIR_BASE_URL', 'OIDC_ISSUER', 'OIDC_JWKS_URI',
            'PRODUCT_URL', 'PRODUCT_SUPPORT_URL', 'PRODUCT_DOCUMENTATION_URL', 'PRODUCT_LOGO_URL'] as $key) {
            if ($this->get($key) !== '') {
                self::validateUrl($this->get($key));
            }
        }
        if ($this->get('TERMINOLOGY_API_KEY') !== '' && $this->get('TERMINOLOGY_BEARER_TOKEN') !== '') {
            throw new InvalidArgumentException('Configure one terminology authentication method.');
        }
        $this->ckmSources();
        $this->tenantGitRemotes();
        if ($this->get('MCP_ALLOWED_HOSTS') === '' || str_contains($this->get('MCP_ALLOWED_HOSTS'), '*')) {
            throw new InvalidArgumentException('MCP_ALLOWED_HOSTS requires explicit hostnames.');
        }
        foreach ($this->csv('CORS_ALLOWED_ORIGINS') as $origin) {
            self::validateUrl($origin);
            if (rtrim($origin, '/') !== $origin || parse_url($origin, PHP_URL_PATH)) {
                throw new InvalidArgumentException('CORS_ALLOWED_ORIGINS must contain origins without paths.');
            }
        }
    }

    public static function fromEnvironment(): self
    {
        $values = [];
        foreach (self::DEFAULTS as $key => $default) {
            $value = getenv($key);
            if ($value !== false) {
                $values[$key] = $value;
            }
        }
        // Legacy names remain accepted when the replacement is absent.
        if (!isset($values['CKM_TIMEOUT']) && isset($values['HTTP_TIMEOUT'])) {
            $values['CKM_TIMEOUT'] = (string) (int) ceil((float) $values['HTTP_TIMEOUT']);
        }
        if (isset($values['HTTP_TIMEOUT'])) {
            $values['HTTP_TIMEOUT'] = (string) (int) ceil((float) $values['HTTP_TIMEOUT']);
        }
        if (getenv('ALLOWED_HOSTS') !== false && !isset($values['MCP_ALLOWED_HOSTS'])) {
            $values['MCP_ALLOWED_HOSTS'] = (string) getenv('ALLOWED_HOSTS');
        }
        return new self($values);
    }

    /** @param array<string, string> $overrides */
    public function with(array $overrides): self { return new self(array_replace($this->values, $overrides)); }

    public function get(string $key): string
    {
        return $this->values[$key] ?? throw new InvalidArgumentException('Unknown configuration key.');
    }

    /**
     * @return list<string> */
    public function csv(string $key): array
    {
        return array_values(array_filter(array_map('trim', explode(',', $this->get($key)))));
    }

    /** Each signed tenant namespace has a distinct remote, never a caller-supplied URL.
     * @return array<string, string> */
    public function tenantGitRemotes(): array
    {
        try {
            $remotes = json_decode($this->get('OIDC_TENANT_GIT_REMOTES'), true, 8, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new InvalidArgumentException('Invalid OIDC_TENANT_GIT_REMOTES JSON.');
        }
        if (!is_array($remotes) || ($remotes !== [] && array_is_list($remotes)) || count($remotes) > 1000) {
            throw new InvalidArgumentException('OIDC_TENANT_GIT_REMOTES must be an object.');
        }
        foreach ($remotes as $tenant => $remote) {
            if (!is_string($tenant) || !preg_match('/^[a-f0-9]{64}$/D', $tenant) || !is_string($remote)
                || $remote === '' || strlen($remote) > 2048 || preg_match('/[\x00-\x20\x7f]/', $remote)) {
                throw new InvalidArgumentException('Invalid tenant Git mapping.');
            }
        }
        $identities = array_map(static function (string $remote): string {
            $url = parse_url($remote);
            if (is_array($url) && isset($url['host'], $url['path'])) {
                // HTTPS and SSH forms of one hosted repository are the same tenant boundary.
                $host = strtolower($url['host']);
                $path = preg_replace('/\\.git$/D', '', rtrim($url['path'], '/')) ?? $url['path'];
                return $host . ':' . ($host === 'github.com' ? strtolower($path) : $path);
            }
            return realpath($remote) ?: rtrim($remote, '/');
        }, $remotes);
        if (count(array_unique($identities)) !== count($remotes)) {
            throw new InvalidArgumentException('Tenants require distinct Git remotes.');
        }
        return $remotes;
    }

    /**
     * @return array<string, string> */
    public function ckmSources(): array
    {
        try {
            $sources = json_decode($this->get('CKM_SOURCES'), true, 16, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new InvalidArgumentException('CKM_SOURCES must be a JSON object of source names to base URLs.');
        }
        if (!is_array($sources) || ($sources !== [] && array_is_list($sources))) {
            throw new InvalidArgumentException('CKM_SOURCES must be an object.');
        }
        $sources = ['default' => $this->get('CKM_API_BASE_URL')] + $sources;
        foreach ($sources as $name => $url) {
            if (!is_string($name) || !preg_match('/^[a-zA-Z0-9_-]{1,64}$/D', $name) || !is_string($url)) {
                throw new InvalidArgumentException('Invalid CKM source name or URL.');
            }
            self::validateUrl($url);
            $sources[$name] = rtrim($url, '/') . '/';
        }
        if (!isset($sources[$this->get('CKM_DEFAULT_SOURCE')])) {
            throw new InvalidArgumentException('CKM_DEFAULT_SOURCE is not configured.');
        }
        return $sources;
    }

    public static function validateUrl(string $url): void
    {
        $parts = parse_url($url);
        if ($parts === false || !isset($parts['host']) || ($parts['scheme'] ?? '') !== 'https'
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
            || preg_match('/[\x00-\x20\x7f]/', $url)) {
            throw new InvalidArgumentException('Configured URLs must use HTTPS without credentials, query or fragment.');
        }
    }
}
