<?php
declare(strict_types=1);

namespace Sounify;

use PDO;

class Database
{
    private static ?PDO $pdo = null;

    public static function get(?string $dbPath = null): PDO
    {
        if (self::$pdo === null) {
            if ($dbPath === null) {
                $dir = dirname(__DIR__) . '/storage';
                $sounifyDb = "{$dir}/sounify.db";
                $legacyDb = "{$dir}/downtify.db";
                if (!file_exists($sounifyDb) && file_exists($legacyDb)) {
                    @rename($legacyDb, $sounifyDb);
                }
                $dbPath = $sounifyDb;
            }

            $dir = dirname($dbPath);
            if (!is_dir($dir)) {
                mkdir($dir, 0755, true);
            }

            self::$pdo = new PDO("sqlite:{$dbPath}");
            self::$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            self::$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

            // SQLite optimizations for Orange Pi flash storage / SD card endurance and concurrency
            try {
                self::$pdo->exec("PRAGMA journal_mode = WAL;");
                self::$pdo->exec("PRAGMA synchronous = NORMAL;");
            } catch (\Throwable) {}

            self::initSchema(self::$pdo);
        }

        return self::$pdo;
    }

    private static function initSchema(PDO $pdo): void
    {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                spotify_id TEXT,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT,
                duration INTEGER DEFAULT 0,
                cover_url TEXT,
                target_format TEXT DEFAULT 'mp3',
                status TEXT DEFAULT 'pending',
                progress REAL DEFAULT 0.0,
                message TEXT DEFAULT '',
                output_path TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                spotify_id TEXT,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT,
                year TEXT,
                genre TEXT,
                duration INTEGER DEFAULT 0,
                file_path TEXT NOT NULL,
                format TEXT NOT NULL,
                downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ");

        try { $pdo->exec("ALTER TABLE history ADD COLUMN year TEXT"); } catch (\Throwable) {}
        try { $pdo->exec("ALTER TABLE history ADD COLUMN genre TEXT"); } catch (\Throwable) {}

        // Índices para optimizar consultas de estado y listado
        try {
            $pdo->exec("
                CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
                CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
                CREATE INDEX IF NOT EXISTS idx_history_downloaded_at ON history(downloaded_at);
            ");
        } catch (\Throwable) {}

        // Valores iniciales por defecto si no existen
        $defaults = [
            'download_dir' => dirname(__DIR__) . '/storage/downloads',
            'audio_format' => 'mp3',
            'audio_bitrate' => '320',
            'organize_by_artist' => '1',
            'organize_by_album' => '1',
            'filename_format' => 'artist_title',
            'include_track_number' => '1',
            'save_cover_image' => '1',
            'save_m3u' => '1',
            'navidrome_enabled' => '0',
            'navidrome_url' => 'http://127.0.0.1:4533',
            'navidrome_user' => '',
            'navidrome_pass' => '',
            'navidrome_auto_scan' => '1',
            'auth_enabled' => '1',
            'auth_username' => 'admin',
            'auth_password_hash' => password_hash('admin', PASSWORD_DEFAULT),
        ];

        $stmt = $pdo->prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (:key, :value)");
        foreach ($defaults as $k => $v) {
            $stmt->execute([':key' => $k, ':value' => $v]);
        }
    }
}
