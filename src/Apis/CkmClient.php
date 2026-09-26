<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Apis;

use GuzzleHttp\Client;
use GuzzleHttp\ClientTrait;
use GuzzleHttp\Promise\PromiseInterface;
use OpenEHR\Assistant\Configuration\Settings;
use Psr\Http\Message\ResponseInterface;
use Psr\Log\LoggerInterface;

class CkmClient
{
    use ClientTrait;

    protected readonly Client $client;
    private readonly Settings $settings;

    public function __construct(protected readonly LoggerInterface $logger, ?Client $client = null, ?Settings $settings = null)
    {
        $this->settings = $settings ?? Settings::fromEnvironment();
        $source = $this->settings->ckmSources()[$this->settings->get('CKM_DEFAULT_SOURCE')];
        $this->client = $client ?? HttpClientFactory::create($source, (int) $this->settings->get('CKM_TIMEOUT'), $this->settings);
    }

    public function forSource(?string $source): self
    {
        if ($source === null || $source === $this->settings->get('CKM_DEFAULT_SOURCE')) {
            return $this;
        }
        $sources = $this->settings->ckmSources();
        if (!isset($sources[$source])) {
            throw new \Mcp\Exception\ToolCallException('CKM_SOURCE_UNKNOWN: select a name returned by ckm_sources.');
        }
        return new self($this->logger, HttpClientFactory::create($sources[$source], (int) $this->settings->get('CKM_TIMEOUT'), $this->settings), $this->settings);
    }

    /**
     * @return array<string, string> */
    public function sources(): array
    {
        return $this->settings->ckmSources();
    }

    public function defaultSource(): string
    {
        return $this->settings->get('CKM_DEFAULT_SOURCE');
    }

    /**
     * @param array<string, mixed> $options */
    public function request(string $method, $uri, array $options = []): ResponseInterface
    {
        HttpClientFactory::relativePath((string) $uri);
        return $this->client->request($method, $uri, $options);
    }

    /**
     * @param array<string, mixed> $options */
    public function requestAsync(string $method, $uri, array $options = []): PromiseInterface
    {
        HttpClientFactory::relativePath((string) $uri);
        return $this->client->requestAsync($method, $uri, $options);
    }
}
