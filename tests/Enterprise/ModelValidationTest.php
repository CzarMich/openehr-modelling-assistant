<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Tests\Enterprise;

use OpenEHR\Assistant\Validation\ModelValidator;
use OpenEHR\Assistant\Domain\Modelling\QualityPipeline;
use PHPUnit\Framework\Attributes\CoversNothing;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

#[CoversNothing]
final class ModelValidationTest extends TestCase
{
    public const string OET = '<template xmlns="openEHR/v1/Template"><id>test</id><name>Test</name><definition archetype_id="openEHR-EHR-COMPOSITION.fixture.v1"><Content archetype_id="openEHR-EHR-OBSERVATION.fixture.v1" path="/content"><Rule path="/data[at0001]" min="0" max="1"/></Content></definition></template>';

    #[DataProvider('maliciousXml')]
    public function test_unsafe_or_malformed_xml_is_rejected(string $xml): void
    {
        $result = (new ModelValidator())->validate($xml, 'xml');
        self::assertFalse($result['valid']);
        self::assertSame('INVALID', $result['status']);
        self::assertNotEmpty($result['errors']);
    }

    public static function maliciousXml(): array
    {
        return [[''], ['<unclosed>'], ['<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>'],
            ['<!DOCTYPE x SYSTEM "https://example.org/evil.dtd"><x/>'], [str_repeat('x', 2097153)], ["<x>\0</x>"]];
    }

    public function test_xml_success_is_not_full_oet_or_opt_validation(): void
    {
        $validator = new ModelValidator();
        self::assertTrue($validator->validate('<root/>', 'xml')['valid']);
        $oet = $validator->validate(self::OET, 'oet');
        self::assertNull($oet['valid']);
        self::assertTrue($oet['structurally_valid']);
        self::assertSame('PARTIAL', $oet['status']);
        self::assertFalse($validator->validate(self::OET, 'opt')['valid']);
        self::assertFalse($validator->validate(str_replace('min="0"', 'min="2"', self::OET), 'oet')['valid']);
        self::assertSame('NOT_EXECUTED', $validator->validate('SELECT e FROM EHR e', 'aql')['status']);
        self::assertFalse((new QualityPipeline($validator))->run(self::OET, 'oet')['release_eligible']);
    }

    public function test_semantic_diff_ignores_attribute_order_but_reports_constraints(): void
    {
        $validator = new ModelValidator();
        $same = str_replace('min="0" max="1"', 'max="1" min="0"', self::OET);
        self::assertSame([], $validator->diff(self::OET, $same)['changed']);
        self::assertCount(1, $validator->diff(self::OET, str_replace('min="0"', 'min="1"', self::OET))['changed']);
    }

    public function test_adl_preflight_distinguishes_invalid_identifiers_and_partial_validation(): void
    {
        $validator = new ModelValidator();
        self::assertFalse($validator->validate('archetype\nnot-an-archetype ', 'adl')['valid']);
        $adl = file_get_contents(APP_RESOURCES_DIR . '/examples/archetypes/openEHR-EHR-CLUSTER.anatomical_location.v1.adl');
        $result = $validator->validate($adl, 'adl');
        self::assertSame('PARTIAL', $result['status']);
        self::assertNull($result['valid']);
    }
}
