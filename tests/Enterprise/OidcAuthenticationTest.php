<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Tests\Enterprise;

use Firebase\JWT\JWT;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use Nyholm\Psr7\ServerRequest;
use OpenEHR\Assistant\Auth\AccessPolicy;
use OpenEHR\Assistant\Auth\HttpGuard;
use OpenEHR\Assistant\Auth\OidcAuthenticator;
use OpenEHR\Assistant\Auth\Principal;
use OpenEHR\Assistant\Configuration\Settings;
use OpenEHR\Assistant\Integrations\Repository\RepositoryFactory;
use PHPUnit\Framework\Attributes\CoversNothing;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Cache\Adapter\ArrayAdapter;
use Symfony\Component\Cache\Psr16Cache;

#[CoversNothing]
final class OidcAuthenticationTest extends TestCase
{
    private static string $private;
    private static array $jwk;

    public static function setUpBeforeClass(): void
    {
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($key, self::$private);
        $details = openssl_pkey_get_details($key);
        self::$jwk = ['kid' => 'test-key', 'kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig',
            'n' => JWT::urlsafeB64Encode($details['rsa']['n']), 'e' => JWT::urlsafeB64Encode($details['rsa']['e'])];
    }

    private function settings(array $overrides = []): Settings
    {
        return new Settings(array_replace(['AUTH_MODE' => 'oidc', 'OIDC_ISSUER' => 'https://identity.example/tenant',
            'OIDC_AUDIENCE' => 'modelling-api', 'OIDC_JWKS_URI' => 'https://identity.example/tenant/keys',
            'OIDC_ALLOWED_CLIENT_IDS' => 'trusted-client', 'OIDC_TENANT_CLAIM' => 'tid', 'OIDC_ALLOWED_TENANTS' => 'one,two'], $overrides));
    }

    private function claims(array $overrides = []): array
    {
        return array_replace(['iss' => 'https://identity.example/tenant', 'aud' => 'modelling-api', 'sub' => 'user-one',
            'exp' => time() + 600, 'iat' => time(), 'scope' => 'modelling.read', 'azp' => 'trusted-client',
            'tid' => 'one', 'roles' => ['reader'], 'amr' => ['pwd', 'otp']], $overrides);
    }

    private function verifier(?Psr16Cache $cache = null, ?MockHandler $mock = null, ?Settings $settings = null): OidcAuthenticator
    {
        $mock ??= new MockHandler([new Response(200, [], json_encode(['keys' => [self::$jwk]]))]);
        return new OidcAuthenticator($settings ?? $this->settings(), new Client(['handler' => HandlerStack::create($mock)]), $cache ?? new Psr16Cache(new ArrayAdapter()));
    }

    private function request(array $claims, string $key = '', string $kid = 'test-key'): ServerRequest
    {
        $token = JWT::encode($claims, $key ?: self::$private, 'RS256', $kid);
        return new ServerRequest('POST', 'https://localhost/mcp', ['Authorization' => 'Bearer ' . $token], '{}');
    }

    public function test_verified_identity_scopes_roles_tenant_and_http_guard(): void
    {
        $verifier = $this->verifier();
        $request = $this->request($this->claims());
        $identity = $verifier->identity($request);
        self::assertNotNull($identity);
        self::assertSame(hash('sha256', 'one'), $identity->tenant);
        self::assertSame(['reader'], $identity->roles);
        self::assertTrue($identity->human);
        self::assertStringStartsWith('oidc:', $identity->id);
        self::assertNull((new HttpGuard($this->settings(), $verifier))->check($request));
        self::assertSame($identity->id, $verifier->authenticate($request));
        self::assertNotSame($identity->id, $verifier->identity($this->request($this->claims(['tid' => 'two'])))->id);
    }

    #[DataProvider('invalidClaims')]
    public function test_invalid_claims_fail_closed(array $changes): void
    {
        self::assertNull($this->verifier()->identity($this->request($this->claims($changes))));
    }

    public static function invalidClaims(): array
    {
        return [[['iss' => 'https://evil.example']], [['aud' => 'wrong-api']], [['sub' => '']], [['exp' => 1]],
            [['exp' => null]], [['iat' => null]], [['iat' => time() + 600]], [['nbf' => time() + 600]],
            [['nbf' => '123']], [['iat' => time() - 9000]], [['scope' => 'unrelated']], [['scope' => ['modelling.read']]],
            [['roles' => 'administrator']], [['tid' => 'unauthorized']], [['tid' => null]], [['azp' => 'other-client']]];
    }

    public function test_forged_signature_and_algorithm_confusion_are_rejected(): void
    {
        $other = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($other, $private);
        self::assertNull($this->verifier()->identity($this->request($this->claims(), $private)));
        $hmac = JWT::encode($this->claims(), str_repeat('secret', 8), 'HS256', 'test-key');
        self::assertNull($this->verifier()->identity(new ServerRequest('POST', 'https://localhost/mcp', ['Authorization' => 'Bearer ' . $hmac])));
    }

    public function test_unknown_kid_refresh_is_bounded_and_rotation_is_accepted_after_refresh_window(): void
    {
        $cache = new Psr16Cache(new ArrayAdapter());
        $rotated = array_replace(self::$jwk, ['kid' => 'next-key']);
        $mock = new MockHandler([new Response(200, [], json_encode(['keys' => [self::$jwk]])), new Response(200, [], json_encode(['keys' => [$rotated]]))]);
        self::assertNotNull($this->verifier($cache, $mock)->identity($this->request($this->claims())));
        $next = $this->request($this->claims(), kid: 'next-key');
        self::assertNull($this->verifier($cache, $mock)->identity($next));
        self::assertSame(1, $mock->count());
        $cache->delete(hash('sha256', 'https://identity.example/tenant|https://identity.example/tenant/keys') . '-refresh');
        self::assertNotNull($this->verifier($cache, $mock)->identity($next));
        self::assertSame(0, $mock->count());
    }

    public function test_duplicate_signing_keys_and_upstream_failures_fail_closed(): void
    {
        foreach ([new Response(200, [], json_encode(['keys' => [self::$jwk, self::$jwk]])), new Response(503, [], 'sensitive-provider-body'),
            new Response(200, [], '<html>login</html>'), new Response(200, [], json_encode(['keys' => [array_replace(self::$jwk, ['use' => 'enc'])]]))] as $response) {
            self::assertNull($this->verifier(mock: new MockHandler([$response]))->identity($this->request($this->claims())));
        }
    }

    public function test_entra_scopes_and_nested_keycloak_roles_are_supported(): void
    {
        $claims = $this->claims(['scope' => null, 'scp' => 'modelling.read', 'realm_access' => ['roles' => ['modeller']], 'amr' => []]);
        $identity = $this->verifier(settings: $this->settings(['OIDC_ROLES_CLAIM' => 'realm_access.roles']))->identity($this->request($claims));
        self::assertNotNull($identity);
        self::assertSame(['modeller'], $identity->roles);
        self::assertFalse($identity->human);
        (new AccessPolicy($this->settings(['MODEL_REPOSITORY_WRITE_ENABLED' => 'true']), $identity))->assertModelWrite();
    }

    public function test_reader_cannot_write_even_when_deployment_writes_enabled(): void
    {
        $identity = $this->verifier()->identity($this->request($this->claims()));
        $this->expectExceptionMessage('WRITE_PERMISSION_REQUIRED');
        (new AccessPolicy($this->settings(['MODEL_REPOSITORY_WRITE_ENABLED' => 'true']), $identity))->assertModelWrite();
    }

    public function test_different_tenants_cannot_read_each_others_projects(): void
    {
        $root = sys_get_temp_dir() . '/oidc-tenants-' . bin2hex(random_bytes(8));
        $settings = $this->settings(['MODEL_REPOSITORY_PATH' => $root]);
        $one = RepositoryFactory::create($settings, new Principal('one', hash('sha256', 'one')));
        $two = RepositoryFactory::create($settings, new Principal('two', hash('sha256', 'two')));
        $one->createProject('private-project', 'Private', '');
        self::assertSame([], $two->listProjects());
        $this->expectExceptionMessage('PROJECT_NOT_FOUND');
        $two->getProject('private-project');
    }
}
