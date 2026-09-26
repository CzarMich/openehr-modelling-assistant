<?php

declare(strict_types=1);
namespace OpenEHR\Assistant\Tests\Content;
use PHPUnit\Framework\Attributes\CoversNothing;
use PHPUnit\Framework\TestCase;
#[CoversNothing]
final class InstallDocContractTest extends TestCase
{
    public function test_independent_installation_is_documented(): void
    {
        $doc = (string) file_get_contents(__DIR__ . '/../../docs/install.md');
        self::assertStringContainsString('github.com/CzarMich/openehr-modelling-assistant', $doc);
        self::assertStringContainsString('docker compose up -d --build', $doc);
        self::assertStringContainsString('DEPLOYMENT.md', $doc);
        self::assertStringNotContainsString('apps.cadasto.com', $doc);
        self::assertSame(0, preg_match_all('/^(```|~~~)/m', $doc) % 2);
        preg_match_all('/\]\((?!https?:|mailto:|#|\/)([^)\s#]+)/', $doc, $matches);
        foreach ($matches[1] as $target) {
            $resolved = realpath(__DIR__ . '/../../docs/' . $target);
            self::assertNotFalse($resolved);
            self::assertStringStartsWith((string) realpath(__DIR__ . '/../..') . '/', $resolved);
        }
    }
}
