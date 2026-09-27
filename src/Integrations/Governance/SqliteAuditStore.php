<?php

declare(strict_types=1);

namespace OpenEHR\Assistant\Integrations\Governance;

use OpenEHR\Assistant\Domain\Governance\AuditStore;
use PDO;

/** Append-only, transactional governance ledger; never exposed as a ModelRepository path. */
final class SqliteAuditStore implements AuditStore
{
    private PDO $database;

    public function __construct(string $path)
    {
        if ($path !== ':memory:') {
            if (!str_starts_with($path, '/') || str_contains($path, "\0") || str_contains($path, '/../') || is_link($path)) {
                throw new \InvalidArgumentException('INVALID_GOVERNANCE_DATABASE_PATH');
            }
            $parent = dirname($path);
            if (!is_dir($parent) && !mkdir($parent, 0700, true) && !is_dir($parent)) { throw new \RuntimeException('GOVERNANCE_STORAGE_UNAVAILABLE'); }
            for ($dir = $parent; $dir !== '/'; $dir = dirname($dir)) {
                if (is_link($dir)) { throw new \InvalidArgumentException('GOVERNANCE_STORAGE_SYMLINK_FORBIDDEN'); }
            }
        }
        $this->database = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        if ($path !== ':memory:' && !chmod($path, 0600)) { throw new \RuntimeException('GOVERNANCE_STORAGE_PERMISSIONS_FAILED'); }
        $this->database->exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
        $this->database->exec('CREATE TABLE IF NOT EXISTS governance_events (
            tenant TEXT NOT NULL, subject TEXT NOT NULL, sequence INTEGER NOT NULL,
            project TEXT NOT NULL, event TEXT NOT NULL, hash TEXT NOT NULL,
            PRIMARY KEY (tenant, subject, sequence));
            CREATE INDEX IF NOT EXISTS governance_projects ON governance_events (tenant, project, subject, sequence);
            CREATE TRIGGER IF NOT EXISTS immutable_governance_update BEFORE UPDATE ON governance_events BEGIN SELECT RAISE(ABORT, "GOVERNANCE_EVENTS_IMMUTABLE"); END;
            CREATE TRIGGER IF NOT EXISTS immutable_governance_delete BEFORE DELETE ON governance_events BEGIN SELECT RAISE(ABORT, "GOVERNANCE_EVENTS_IMMUTABLE"); END;
            CREATE TABLE IF NOT EXISTS governance_nonces (nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL);');
    }

    public function subjects(string $tenant, string $project, int $limit = 100, int $offset = 0): array
    {
        $this->tenant($tenant); $this->project($project);
        if ($limit < 1 || $limit > 100 || $offset < 0 || $offset > 10000) { throw new \InvalidArgumentException('INVALID_GOVERNANCE_PAGE'); }
        $query = $this->database->prepare('SELECT subject, MAX(sequence) AS sequence FROM governance_events WHERE tenant = :tenant AND project = :project GROUP BY subject ORDER BY subject LIMIT :limit OFFSET :offset');
        $query->bindValue(':tenant', $tenant); $query->bindValue(':project', $project);
        $query->bindValue(':limit', $limit, PDO::PARAM_INT); $query->bindValue(':offset', $offset, PDO::PARAM_INT); $query->execute();
        $result = [];
        foreach ($query->fetchAll() as $row) {
            $events = $this->events($tenant, $row['subject']);
            $result[] = ['subject' => $row['subject'], 'sequence' => (int) $row['sequence'], 'first' => $events[0], 'latest' => $events[count($events) - 1]];
        }
        return $result;
    }

    public function events(string $tenant, string $subject): array
    {
        $this->tenant($tenant); $this->subject($subject);
        $query = $this->database->prepare('SELECT sequence, project, event, hash FROM governance_events WHERE tenant = ? AND subject = ? ORDER BY sequence');
        $query->execute([$tenant, $subject]); $events = []; $previous = str_repeat('0', 64); $sequence = 0;
        while ($row = $query->fetch()) {
            if (++$sequence > 256) { throw new \RuntimeException('GOVERNANCE_HISTORY_LIMIT_EXCEEDED'); }
            $event = json_decode($row['event'], true, 64, JSON_THROW_ON_ERROR);
            if (!is_array($event) || ($event['sequence'] ?? null) !== $sequence || (int) $row['sequence'] !== $sequence
                || ($event['project'] ?? null) !== $row['project']
                || ($event['tenant'] ?? null) !== $tenant || ($event['subject'] ?? null) !== $subject
                || ($event['previous_hash'] ?? null) !== $previous || !hash_equals(hash('sha256', $row['event']), $row['hash'])) {
                throw new \RuntimeException('GOVERNANCE_AUDIT_INTEGRITY_FAILED');
            }
            $events[] = $event + ['hash' => $row['hash']]; $previous = $row['hash'];
        }
        return $events;
    }

    public function append(string $tenant, string $subject, int $expectedSequence, array $event): array
    {
        $this->tenant($tenant); $this->subject($subject); $this->project($event['project'] ?? '');
        if ($expectedSequence < 0 || $expectedSequence >= 256 || array_intersect(array_keys($event), ['tenant', 'subject', 'sequence', 'timestamp', 'hash', 'previous_hash']) !== []) {
            throw new \InvalidArgumentException('INVALID_GOVERNANCE_EVENT');
        }
        $this->database->exec('BEGIN IMMEDIATE');
        try {
            $history = $this->events($tenant, $subject);
            if (count($history) !== $expectedSequence) { throw new \RuntimeException('GOVERNANCE_REVISION_CONFLICT'); }
            if ($history !== [] && $history[0]['project'] !== $event['project']) { throw new \RuntimeException('GOVERNANCE_SUBJECT_IDENTITY_CONFLICT'); }
            $event = ['tenant' => $tenant, 'subject' => $subject, 'sequence' => $expectedSequence + 1, 'timestamp' => gmdate(DATE_ATOM),
                'previous_hash' => $expectedSequence === 0 ? str_repeat('0', 64) : $history[$expectedSequence - 1]['hash']] + $event;
            $encoded = json_encode($event, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE, 64);
            if (strlen($encoded) > 65536) { throw new \InvalidArgumentException('GOVERNANCE_EVENT_TOO_LARGE'); }
            $hash = hash('sha256', $encoded);
            $query = $this->database->prepare('INSERT INTO governance_events (tenant,subject,sequence,project,event,hash) VALUES (?,?,?,?,?,?)');
            $query->execute([$tenant, $subject, $event['sequence'], $event['project'], $encoded, $hash]);
            $this->database->exec('COMMIT');
            return $event + ['hash' => $hash];
        } catch (\Throwable $error) { $this->database->exec('ROLLBACK'); throw $error; }
    }

    public function consumeNonce(string $nonce, int $expires): void
    {
        if (!preg_match('/^[a-f0-9]{64}$/D', $nonce) || $expires < time() || $expires > time() + 120) {
            throw new \InvalidArgumentException('INVALID_GOVERNANCE_ASSERTION');
        }
        $this->database->exec('BEGIN IMMEDIATE');
        try {
            $delete = $this->database->prepare('DELETE FROM governance_nonces WHERE expires < ?'); $delete->execute([time() - 120]);
            $count = $this->database->prepare('SELECT COUNT(*) FROM governance_nonces'); $count->execute();
            if ((int) $count->fetchColumn() >= 10000) { throw new \RuntimeException('GOVERNANCE_ASSERTION_LIMIT_EXCEEDED'); }
            $insert = $this->database->prepare('INSERT OR IGNORE INTO governance_nonces (nonce,expires) VALUES (?,?)'); $insert->execute([$nonce, $expires]);
            if ($insert->rowCount() !== 1) { throw new \RuntimeException('GOVERNANCE_ASSERTION_REPLAYED'); }
            $this->database->exec('COMMIT');
        } catch (\Throwable $error) { $this->database->exec('ROLLBACK'); throw $error; }
    }

    private function tenant(string $tenant): void
    {
        if (!preg_match('/^(?:shared|[a-f0-9]{64})$/D', $tenant)) { throw new \InvalidArgumentException('INVALID_GOVERNANCE_TENANT'); }
    }
    private function subject(string $subject): void
    {
        if (!preg_match('/^[a-f0-9]{64}$/D', $subject)) { throw new \InvalidArgumentException('INVALID_GOVERNANCE_SUBJECT'); }
    }
    private function project(string $project): void
    {
        if (!preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/D', $project)) { throw new \InvalidArgumentException('INVALID_GOVERNANCE_PROJECT'); }
    }
}
