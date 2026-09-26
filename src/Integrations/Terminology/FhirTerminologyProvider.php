<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Integrations\Terminology;

use GuzzleHttp\Client;
use OpenEHR\Assistant\Apis\HttpClientFactory;
use OpenEHR\Assistant\Configuration\Settings;
use OpenEHR\Assistant\Domain\Terminology\TerminologyProvider;

/** FHIR is an adapter format. No FHIR resource classes enter the modelling domain. */
final readonly class FhirTerminologyProvider implements TerminologyProvider
{
    private ?Client $client;
    private string $endpoint;
    private string $codeSystemParameter;
    /** @var array<string, string> */
    private array $headers;

    public function __construct(Settings $settings, ?Client $client = null)
    {
        $this->endpoint = $settings->get('TERMINOLOGY_FHIR_BASE_URL');
        $this->codeSystemParameter = $settings->get('TERMINOLOGY_CODESYSTEM_VALIDATE_PARAMETER');
        $headers = ['Accept' => 'application/fhir+json'];
        if ($settings->get('TERMINOLOGY_API_KEY') !== '') {
            $headers[$settings->get('TERMINOLOGY_API_KEY_HEADER')] = $settings->get('TERMINOLOGY_API_KEY');
        }
        $this->headers = $headers;
        $this->client = $client ?? ($this->endpoint === '' ? null : HttpClientFactory::create(
            $this->endpoint, (int) $settings->get('HTTP_TIMEOUT'), $settings, $settings->get('TERMINOLOGY_BEARER_TOKEN')));
    }

    public function lookup(string $system, string $code, ?string $version = null): array
    {
        return $this->operation('CodeSystem/$lookup', ['system' => $system, 'code' => $code, 'version' => $version], 'lookup');
    }

    public function validateCode(string $system, string $code, ?string $valueSet = null, ?string $version = null): array
    {
        $parameters = ['system' => $system, 'code' => $code];
        if ($valueSet !== null) {
            $parameters['url'] = $valueSet;
            $parameters['valueSetVersion'] = $version;
        } else {
            // CodeSystem/$validate-code uses url, not system, to identify the code system.
            unset($parameters['system']);
            $parameters[$this->codeSystemParameter] = $system;
            $parameters['version'] = $version;
        }
        return $this->operation(($valueSet === null ? 'CodeSystem' : 'ValueSet') . '/$validate-code', $parameters, 'validate');
    }

    public function expand(string $valueSet, ?string $version = null, int $count = 50): array
    {
        return $this->operation('ValueSet/$expand', ['url' => $valueSet, 'valueSetVersion' => $version,
            'count' => max(1, min(500, $count))], 'expand');
    }

    /**
     * @return array<string, mixed> */
    public function capabilities(): array
    {
        return $this->operation('metadata', [], 'metadata');
    }

    /**
     * @param array<string, string|int|null> $parameters
     * @return array<string, mixed> */
    private function operation(string $path, array $parameters, string $kind): array
    {
        $provenance = ['provider' => 'fhir', 'endpoint' => $this->endpoint, 'operation' => $path, 'timestamp' => gmdate(DATE_ATOM)];
        if ($this->client === null) {
            return $this->failure('TERMINOLOGY_NOT_CONFIGURED', $provenance);
        }
        foreach ($parameters as $key => $value) {
            if ($value !== null && (strlen((string) $value) > 2048 || (string) $value === '')) {
                throw new \InvalidArgumentException('Invalid terminology parameter: ' . $key);
            }
        }
        try {
            $response = $this->client->request('GET', $path, ['headers' => $this->headers,
                'query' => array_filter($parameters, static fn ($value): bool => $value !== null)]);
            if ($response->getStatusCode() !== 200) {
                return $this->failure('TERMINOLOGY_HTTP_' . $response->getStatusCode(), $provenance);
            }
            $body = (string) $response->getBody();
            if (strlen($body) > 8388608) {
                return $this->failure('TERMINOLOGY_RESPONSE_TOO_LARGE', $provenance);
            }
            $data = json_decode($body, true, 64, JSON_THROW_ON_ERROR);
            if (!is_array($data)) {
                return $this->failure('TERMINOLOGY_INVALID_RESPONSE', $provenance);
            }
            $resourceType = $data['resourceType'] ?? '';
            $expected = match ($kind) { 'expand' => 'ValueSet', 'metadata' => 'CapabilityStatement', default => 'Parameters' };
            if ($resourceType !== $expected) {
                return $this->failure('TERMINOLOGY_INVALID_RESPONSE', $provenance);
            }
            if (isset($data['parameter']) && (!is_array($data['parameter']) || !array_is_list($data['parameter']))) {
                return $this->failure('TERMINOLOGY_INVALID_RESPONSE', $provenance);
            }
            $values = [];
            foreach ($data['parameter'] ?? [] as $parameter) {
                if (!is_array($parameter) || !is_string($parameter['name'] ?? null)) {
                    continue;
                }
                foreach ($parameter as $key => $value) {
                    if (str_starts_with((string) $key, 'value')) {
                        $values[$parameter['name']] = $value;
                    }
                }
            }
            if ($kind === 'validate' && !is_bool($values['result'] ?? null)) {
                return $this->failure('TERMINOLOGY_MISSING_RESULT', $provenance);
            }
            if ($kind === 'lookup' && !is_string($values['display'] ?? null)) {
                return $this->failure('TERMINOLOGY_MISSING_DISPLAY', $provenance);
            }
            if ($kind === 'expand' && !is_array($data['expansion'] ?? null)) {
                return $this->failure('TERMINOLOGY_MISSING_EXPANSION', $provenance);
            }
            $returnedVersion = $kind === 'expand' ? ($data['version'] ?? null) : ($values['version'] ?? null);
            $requestedVersion = $parameters['valueSetVersion'] ?? $parameters['version'] ?? null;
            if ($returnedVersion !== null && !is_string($returnedVersion)) {
                return $this->failure('TERMINOLOGY_INVALID_RESPONSE', $provenance);
            }
            if ($returnedVersion !== null && $requestedVersion !== null && $returnedVersion !== $requestedVersion) {
                return $this->failure('TERMINOLOGY_VERSION_MISMATCH', $provenance);
            }
            $warnings = [];
            if ($requestedVersion !== null && $returnedVersion === null) {
                $warnings[] = 'Provider did not return the requested version; version confirmation is unavailable.';
            }
            return ['status' => 'VALIDATED', 'valid' => $kind === 'validate' ? $values['result'] : null,
                'result' => $kind === 'lookup' || $kind === 'validate' ? $values : $data,
                'requested_version' => $requestedVersion, 'returned_version' => $returnedVersion,
                'version_confirmed' => $requestedVersion !== null && $returnedVersion === $requestedVersion,
                'provenance' => $provenance, 'errors' => [], 'warnings' => $warnings];
        } catch (\GuzzleHttp\Exception\RequestException $e) {
            $status = $e->getResponse()?->getStatusCode();
            return $this->failure($status !== null ? 'TERMINOLOGY_HTTP_' . $status : 'TERMINOLOGY_UNAVAILABLE', $provenance);
        } catch (\GuzzleHttp\Exception\GuzzleException|\JsonException|\RuntimeException) {
            return $this->failure('TERMINOLOGY_UNAVAILABLE_OR_INVALID', $provenance);
        }
    }

    /**
     * @param array<string, mixed> $provenance
     * @return array<string, mixed> */
    private function failure(string $code, array $provenance): array
    {
        return ['status' => 'NOT_EXECUTED', 'valid' => null, 'errors' => [$code],
            'message' => 'TERMINOLOGY VALIDATION NOT EXECUTED', 'provenance' => $provenance];
    }
}
