<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Validation;

/** Native JSON parsing plus bounded duplicate-key rejection for unambiguous references. */
final class JsonDocument
{
    public static function parse(string $content): mixed
    {
        if (strlen($content) > 2097152) {
            throw new \InvalidArgumentException('JSON_DOCUMENT_TOO_LARGE');
        }
        $value = json_decode($content, false, 64, JSON_THROW_ON_ERROR);
        // Native parsing validates the grammar first. This scan tracks object keys only;
        // strings are decoded with the native parser so escaped aliases compare equally.
        if (preg_match_all('/"(?:[^"\\\\]|\\\\.)*"|[{}\\[\\]:,]/su', $content, $tokens) === false || count($tokens[0]) > 100000) {
            throw new \InvalidArgumentException('JSON_DOCUMENT_TOKEN_LIMIT');
        }
        $stack = [];
        foreach ($tokens[0] as $i => $token) {
            if ($token === '{' || $token === '[') {
                $stack[] = ['object' => $token === '{', 'keys' => []];
            } elseif ($token === '}' || $token === ']') {
                array_pop($stack);
            } elseif (str_starts_with($token, '"') && ($tokens[0][$i + 1] ?? '') === ':') {
                $at = count($stack) - 1;
                if ($at < 0 || !$stack[$at]['object']) {
                    throw new \InvalidArgumentException('INVALID_JSON_OBJECT');
                }
                $key = json_decode($token, true, 2, JSON_THROW_ON_ERROR);
                if (isset($stack[$at]['keys'][$key])) {
                    throw new \InvalidArgumentException('DUPLICATE_JSON_KEY');
                }
                $stack[$at]['keys'][$key] = true;
            }
        }
        return $value;
    }
}
