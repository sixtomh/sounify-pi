<?php
declare(strict_types=1);

namespace Sounify;

class Config
{
    public static function get(string $key, ?string $default = null): ?string
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare("SELECT value FROM settings WHERE key = :key LIMIT 1");
        $stmt->execute([':key' => $key]);
        $row = $stmt->fetch();
        return $row ? (string) $row['value'] : $default;
    }

    public static function getBool(string $key, bool $default = false): bool
    {
        $val = self::get($key);
        if ($val === null) {
            return $default;
        }
        return in_array(strtolower($val), ['1', 'true', 'yes', 'on'], true);
    }

    public static function getDownloadDir(): string
    {
        $val = self::get('download_dir');
        $default = dirname(__DIR__) . '/storage/downloads';
        if (!$val) {
            return $default;
        }
        // Si estamos en Linux / Orange Pi y el path guardado tiene formato Windows (ej: C:\...)
        if (PHP_OS_FAMILY !== 'Windows' && preg_match('/^[a-zA-Z]:[\\\\\/]/', $val)) {
            return $default;
        }
        // Si estamos en Windows y el path guardado tiene formato Unix absoluto (ej: /opt/... o /mnt/...)
        if (PHP_OS_FAMILY === 'Windows' && str_starts_with($val, '/')) {
            return $default;
        }
        return $val;
    }

    public static function getAll(): array
    {
        $pdo = Database::get();
        $stmt = $pdo->query("SELECT key, value FROM settings WHERE key != 'auth_password_hash'");
        $all = [];
        while ($row = $stmt->fetch()) {
            $all[$row['key']] = $row['value'];
        }
        $all['download_dir'] = self::getDownloadDir();
        return $all;
    }

    public static function set(string $key, string $value): void
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare("INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT(key) DO UPDATE SET value = :value");
        $stmt->execute([':key' => $key, ':value' => $value]);
    }

    public static function setMultiple(array $settings): void
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare("INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT(key) DO UPDATE SET value = :value");
        foreach ($settings as $k => $v) {
            if ($k === 'auth_password_hash') {
                continue;
            }
            $stmt->execute([':key' => $k, ':value' => (string) $v]);
        }
    }
}
