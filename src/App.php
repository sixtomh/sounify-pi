<?php
declare(strict_types=1);

namespace Sounify;

use PDO;
use Sounify\Scraper\SpotifyScraper;
use Sounify\Downloader\AudioDownloader;
use Sounify\Playlist\M3uWriter;
use Sounify\Integrations\NavidromeClient;
use Sounify\Metadata\MetadataEnricher;

class App
{
    private static bool $autoloaderRegistered = false;

    public static function registerAutoloader(): void
    {
        if (self::$autoloaderRegistered) {
            return;
        }
        self::$autoloaderRegistered = true;

        spl_autoload_register(function ($class) {
            $prefix = 'Sounify\\';
            $baseDir = __DIR__ . '/';

            $len = strlen($prefix);
            if (strncmp($prefix, $class, $len) !== 0) {
                return;
            }

            $relativeClass = substr($class, $len);
            $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';

            if (file_exists($file)) {
                require $file;
            }
        });
    }

    private function setHeader(string $header, bool $replace = true, int $responseCode = 0): void
    {
        if (!headers_sent()) {
            if ($responseCode > 0) {
                header($header, $replace, $responseCode);
            } else {
                header($header, $replace);
            }
        }
    }

    private function setResponseCode(int $code): void
    {
        if (!headers_sent()) {
            http_response_code($code);
        }
    }

    private function fetchRemoteUrl(string $url): ?string
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            if ($ch !== false) {
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_FOLLOWLOCATION => true,
                    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
                    CURLOPT_TIMEOUT => 10,
                    CURLOPT_SSL_VERIFYPEER => false,
                ]);
                $res = curl_exec($ch);
                $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                if ($code === 200 && is_string($res) && strlen($res) > 200) {
                    return $res;
                }
            }
        }
        $data = @file_get_contents($url);
        return ($data && strlen($data) > 200) ? $data : null;
    }

    public function run(): void
    {
        if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
            @session_start([
                'cookie_httponly' => true,
                'cookie_samesite' => 'Lax',
            ]);
        }

        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

        // Redirecciones y rutas directas de login y logout
        if ($uri === '/login' || $uri === '/login.php') {
            require dirname(__DIR__) . '/public/login.php';
            return;
        }

        if ($uri === '/logout' || $uri === '/logout.php') {
            require dirname(__DIR__) . '/public/logout.php';
            return;
        }

        // Rutas API
        if (str_starts_with($uri, '/api/')) {
            $this->setHeader('Content-Type: application/json; charset=utf-8');
            try {
                $this->handleApi($uri, $method);
            } catch (\Throwable $e) {
                $this->setResponseCode(500);
                echo json_encode([
                    'error' => true,
                    'message' => $e->getMessage()
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            }
            return;
        }

        // Archivos estáticos en public (css, js, imagenes, fuentes, etc.)
        $publicDir = dirname(__DIR__) . '/public';
        $realPublic = realpath($publicDir) ?: $publicDir;
        $file = $publicDir . $uri;
        $realFile = realpath($file);

        if ($realFile && is_dir($realFile)) {
            if (!str_ends_with($uri, '/')) {
                $this->setHeader("Location: {$uri}/", true, 301);
                exit;
            }
            if (file_exists($realFile . '/index.html')) {
                $realFile = realpath($realFile . '/index.html');
            }
        }

        $mimes = [
            'html' => 'text/html; charset=utf-8',
            'htm'  => 'text/html; charset=utf-8',
            'css'  => 'text/css; charset=utf-8',
            'js'   => 'application/javascript; charset=utf-8',
            'json' => 'application/json; charset=utf-8',
            'svg'  => 'image/svg+xml',
            'png'  => 'image/png',
            'jpg'  => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'ico'  => 'image/x-icon',
            'webp' => 'image/webp',
            'woff' => 'font/woff',
            'woff2'=> 'font/woff2',
            'ttf'  => 'font/ttf',
        ];

        $normReal = $realFile ? str_replace('\\', '/', $realFile) : '';
        $normPub  = str_replace('\\', '/', $realPublic);
        $isInsidePublic = $normReal !== '' && (str_starts_with($normReal, $normPub) || stripos($normReal, $normPub) === 0);

        if ($realFile && $isInsidePublic) {
            $ext = strtolower(pathinfo($realFile, PATHINFO_EXTENSION));
            // Permitir servir archivos estáticos públicos excepto la petición a la app raíz
            if (!is_dir($realFile) && $uri !== '/' && $uri !== '/index.php' && isset($mimes[$ext])) {
                $this->setHeader('Content-Type: ' . $mimes[$ext]);
                $this->setHeader('Cache-Control: public, max-age=3600');
                readfile($realFile);
                return;
            }
        }

        // Si se solicitó un archivo estático conocido que no existe, retornar 404 (nunca redirigir a login.php)
        $reqExt = strtolower(pathinfo($uri, PATHINFO_EXTENSION));
        if ($reqExt !== '' && isset($mimes[$reqExt]) && $reqExt !== 'html' && $reqExt !== 'htm') {
            $this->setResponseCode(404);
            $this->setHeader('Content-Type: text/plain; charset=utf-8');
            echo "Not Found: " . htmlspecialchars($uri);
            return;
        }

        // Si la autenticación está habilitada y no está autenticado, redirigir a login.php
        if (!$this->isAuthenticated()) {
            $this->setHeader('Location: /login.php');
            exit;
        }

        // Servir la vista principal de la aplicación
        $appView = dirname(__DIR__) . '/src/Views/index.html';
        $this->setHeader('Content-Type: text/html; charset=utf-8');
        if (file_exists($appView)) {
            readfile($appView);
        } else {
            echo "Error: La vista principal de la aplicación no se encuentra.";
        }
    }

    private function isAuthenticated(): bool
    {
        return !empty($_SESSION['sounify_authenticated']) && $_SESSION['sounify_authenticated'] === true;
    }

    private function handleApi(string $uri, string $method): void
    {
        $rawInput = file_get_contents('php://input');
        $input = !empty($rawInput) ? json_decode($rawInput, true) : null;
        if (!is_array($input)) {
            $input = $_POST ?: [];
        }

        // Rutas públicas de autenticación
        if ($uri === '/api/auth/status') {
            $authenticated = $this->isAuthenticated();
            $username = $authenticated ? ($_SESSION['sounify_user'] ?? Config::get('auth_username', 'admin')) : '';
            echo json_encode([
                'success' => true,
                'auth_enabled' => true,
                'authenticated' => $authenticated,
                'username' => $username,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            return;
        }

        if ($uri === '/api/auth/login' && $method === 'POST') {
            $user = trim((string) ($input['username'] ?? ''));
            $pass = (string) ($input['password'] ?? '');

            $validUser = Config::get('auth_username', 'admin');
            $validHash = Config::get('auth_password_hash', '');

            if ($user === $validUser && ($validHash !== '' && password_verify($pass, $validHash))) {
                $_SESSION['sounify_authenticated'] = true;
                $_SESSION['sounify_user'] = $user;
                echo json_encode(['success' => true, 'message' => 'Login successful']);
            } else {
                $this->setResponseCode(401);
                echo json_encode(['error' => true, 'message' => 'Usuario o contraseña incorrectos']);
            }
            return;
        }

        if ($uri === '/api/auth/logout' && $method === 'POST') {
            $_SESSION = [];
            unset($_SESSION['sounify_authenticated'], $_SESSION['sounify_user']);
            if (!headers_sent() && ini_get("session.use_cookies")) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', [
                    'expires' => time() - 42000,
                    'path' => $params['path'] ?: '/',
                    'domain' => $params['domain'] ?? '',
                    'secure' => $params['secure'] ?? false,
                    'httponly' => true,
                    'samesite' => 'Lax',
                ]);
            }
            @session_destroy();
            @session_write_close();
            echo json_encode(['success' => true, 'message' => 'Sesión cerrada']);
            return;
        }

        // Si la autenticación está activa y no está autenticado, denegar acceso a la API (excepto /api/cover para carátulas)
        if ($uri !== '/api/cover' && !$this->isAuthenticated()) {
            $this->setResponseCode(401);
            echo json_encode([
                'error' => true,
                'unauthorized' => true,
                'message' => 'Authentication required'
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            return;
        }

        // Endpoint protegido para actualizar credenciales de acceso
        if ($uri === '/api/auth/update-credentials' && $method === 'POST') {
            $currentPass = (string) ($input['current_password'] ?? '');
            $newUsername = trim((string) ($input['new_username'] ?? ''));
            $newPassword = (string) ($input['new_password'] ?? '');

            $validHash = Config::get('auth_password_hash', '');
            if (!password_verify($currentPass, $validHash)) {
                $this->setResponseCode(400);
                echo json_encode(['error' => true, 'message' => 'La contraseña actual no es correcta']);
                return;
            }

            if ($newUsername !== '') {
                Config::set('auth_username', $newUsername);
                $_SESSION['sounify_user'] = $newUsername;
            }

            if ($newPassword !== '') {
                if (strlen($newPassword) < 4) {
                    $this->setResponseCode(400);
                    echo json_encode(['error' => true, 'message' => 'La nueva contraseña debe tener al menos 4 caracteres']);
                    return;
                }
                $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
                $pdo = Database::get();
                $stmt = $pdo->prepare("INSERT INTO settings (key, value) VALUES ('auth_password_hash', :val) ON CONFLICT(key) DO UPDATE SET value = :val");
                $stmt->execute([':val' => $newHash]);
            }

            echo json_encode(['success' => true, 'message' => 'Credenciales actualizadas correctamente']);
            return;
        }

        switch ($uri) {
            case '/api/stats':
                $pdo = Database::get();
                $totalTracks = (int) $pdo->query("SELECT COUNT(*) FROM history")->fetchColumn();
                $activeJobs = (int) $pdo->query("SELECT COUNT(*) FROM jobs WHERE status IN ('pending', 'downloading')")->fetchColumn();
                $recentStmt = $pdo->query("SELECT * FROM history ORDER BY downloaded_at DESC LIMIT 6");
                $recent = $recentStmt->fetchAll();

                $downloadDir = Config::getDownloadDir();
                $diskFree = @disk_free_space($downloadDir);
                $diskTotal = @disk_total_space($downloadDir);
                $storage = null;
                if ($diskTotal !== false && $diskFree !== false && $diskTotal > 0) {
                    $diskUsed = $diskTotal - $diskFree;
                    $storage = [
                        'free' => $diskFree,
                        'total' => $diskTotal,
                        'used' => $diskUsed,
                        'percent' => round(($diskUsed / $diskTotal) * 100, 1),
                        'free_formatted' => round($diskFree / (1024 * 1024 * 1024), 1) . ' GB',
                        'total_formatted' => round($diskTotal / (1024 * 1024 * 1024), 1) . ' GB',
                        'used_formatted' => round($diskUsed / (1024 * 1024 * 1024), 1) . ' GB'
                    ];
                }

                echo json_encode([
                    'success' => true,
                    'stats' => [
                        'total_tracks' => $totalTracks,
                        'active_jobs' => $activeJobs,
                        'navidrome_enabled' => Config::getBool('navidrome_enabled', false),
                        'navidrome_url' => Config::get('navidrome_url', 'http://127.0.0.1:4533'),
                        'audio_format' => Config::get('audio_format', 'mp3'),
                        'recent_tracks' => $recent,
                        'storage' => $storage
                    ]
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                return;

            case '/api/library':
                $pdo = Database::get();
                $stmt = $pdo->query("SELECT * FROM history ORDER BY downloaded_at DESC");
                $tracks = $stmt->fetchAll();
                $totalBytes = 0;
                foreach ($tracks as &$tr) {
                    $fp = (string) ($tr['file_path'] ?? '');
                    if ($fp !== '' && file_exists($fp)) {
                        $sz = (int) filesize($fp);
                        $tr['size'] = $sz;
                        $totalBytes += $sz;
                    } else {
                        $tr['size'] = 0;
                    }
                }
                unset($tr);
                echo json_encode([
                    'success' => true,
                    'tracks' => $tracks,
                    'total_size' => $totalBytes
                ]);
                return;

            case '/api/library/delete':
            case '/api/track/delete':
                if ($method !== 'POST') {
                    $this->setResponseCode(405);
                    echo json_encode(['error' => true, 'message' => 'Method not allowed']);
                    return;
                }
                $id = (int) ($input['id'] ?? ($_GET['id'] ?? 0));
                if ($id <= 0) {
                    $this->setResponseCode(400);
                    echo json_encode(['error' => true, 'message' => 'Track ID is required']);
                    return;
                }
                $pdo = Database::get();
                $stmt = $pdo->prepare("SELECT * FROM history WHERE id = :id LIMIT 1");
                $stmt->execute([':id' => $id]);
                $track = $stmt->fetch();
                if (!$track) {
                    $this->setResponseCode(404);
                    echo json_encode(['error' => true, 'message' => 'Track not found in library']);
                    return;
                }

                $filePath = (string) ($track['file_path'] ?? '');
                $fileDeleted = false;
                if ($filePath !== '' && file_exists($filePath) && is_file($filePath)) {
                    $fileDeleted = @unlink($filePath);

                    // Si el directorio del álbum quedó vacío de audios, limpiar carátulas residuales
                    $dir = dirname($filePath);
                    $downloadDir = realpath(Config::getDownloadDir()) ?: Config::getDownloadDir();
                    $realDir = realpath($dir) ?: $dir;
                    if (is_dir($dir) && $realDir !== $downloadDir) {
                        $remaining = glob($dir . '/*.{mp3,flac,m4a,opus,ogg}', GLOB_BRACE) ?: [];
                        if (empty($remaining)) {
                            foreach (glob($dir . '/*.{jpg,jpeg,png,webp}', GLOB_BRACE) ?: [] as $img) {
                                @unlink($img);
                            }
                            @rmdir($dir);
                        }
                    }
                }

                $delStmt = $pdo->prepare("DELETE FROM history WHERE id = :id");
                $delStmt->execute([':id' => $id]);

                // Eliminar carátula en caché de storage/covers/{id}.jpg si existe
                $cachedCover = dirname(__DIR__) . "/storage/covers/{$id}.jpg";
                if (file_exists($cachedCover)) {
                    @unlink($cachedCover);
                }

                // Limpiar de la lista de jobs si existía
                try {
                    $delJob = $pdo->prepare("DELETE FROM jobs WHERE output_path = :fp");
                    $delJob->execute([':fp' => $filePath]);
                } catch (\Throwable) {}

                // Notificar rescan a Navidrome si está activo
                if (Config::getBool('navidrome_enabled', false) && Config::getBool('navidrome_auto_scan', true)) {
                    try {
                        $navidrome = new NavidromeClient(
                            Config::get('navidrome_url', 'http://127.0.0.1:4533'),
                            Config::get('navidrome_user', ''),
                            Config::get('navidrome_pass', '')
                        );
                        $navidrome->startScan();
                    } catch (\Throwable) {}
                }

                echo json_encode([
                    'success' => true,
                    'message' => "Track '" . ($track['title'] ?? 'Track') . "' deleted from library and disk.",
                    'file_deleted' => $fileDeleted
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                return;

            case '/api/track/update':
            case '/api/library/update':
                if ($method !== 'POST') {
                    $this->setResponseCode(405);
                    echo json_encode(['error' => true, 'message' => 'Method not allowed']);
                    return;
                }
                $id = (int) ($input['id'] ?? ($_POST['id'] ?? 0));
                if ($id <= 0) {
                    $this->setResponseCode(400);
                    echo json_encode(['error' => true, 'message' => 'Track ID is required']);
                    return;
                }

                $pdo = Database::get();
                $stmt = $pdo->prepare("SELECT * FROM history WHERE id = :id LIMIT 1");
                $stmt->execute([':id' => $id]);
                $track = $stmt->fetch();
                if (!$track) {
                    $this->setResponseCode(404);
                    echo json_encode(['error' => true, 'message' => 'Track not found in library']);
                    return;
                }

                $title = trim((string)($input['title'] ?? '')) ?: $track['title'];
                $artist = trim((string)($input['artist'] ?? '')) ?: $track['artist'];
                $album = trim((string)($input['album'] ?? ''));
                $year = trim((string)($input['year'] ?? ''));
                $genre = trim((string)($input['genre'] ?? ''));
                $albumArtist = trim((string)($input['album_artist'] ?? ''));
                if ($albumArtist === '') {
                    $primary = trim(preg_split('/[;,]| feat\.? | ft\.? /i', $artist)[0] ?? $artist);
                    $albumArtist = $primary ?: $artist;
                }

                // Actualizar en base de datos SQLite
                $updateStmt = $pdo->prepare("
                    UPDATE history 
                    SET title = :title, artist = :artist, album = :album, album_artist = :album_artist, year = :year, genre = :genre 
                    WHERE id = :id
                ");
                $updateStmt->execute([
                    ':title' => $title,
                    ':artist' => $artist,
                    ':album' => $album,
                    ':album_artist' => $albumArtist,
                    ':year' => $year,
                    ':genre' => $genre,
                    ':id' => $id,
                ]);

                // Actualizar tags ID3 directamente en el archivo de audio físico si existe
                $filePath = (string)($track['file_path'] ?? '');
                $fileTagged = false;
                if ($filePath !== '' && file_exists($filePath) && is_file($filePath)) {
                    // Si el álbum cambió, verificar si el archivo debe reubicarse en la misma carpeta física del álbum
                    if ($album !== '') {
                        try {
                            $targetDir = null;
                            $siblingStmt = $pdo->prepare("SELECT file_path FROM history WHERE album = :album AND id != :id AND file_path != '' LIMIT 1");
                            $siblingStmt->execute([':album' => $album, ':id' => $id]);
                            $sibling = $siblingStmt->fetch();

                            if ($sibling && !empty($sibling['file_path']) && file_exists(dirname($sibling['file_path']))) {
                                $targetDir = dirname($sibling['file_path']);
                            } elseif (Config::getBool('organize_by_album', true)) {
                                $baseDir = Config::getDownloadDir();
                                $safeArtist = preg_replace('/[\\\\\/:\*\?"<>\|]/', '_', $artist ?: ($track['artist'] ?? 'Unknown Artist'));
                                $safeAlbum = preg_replace('/[\\\\\/:\*\?"<>\|]/', '_', $album);
                                if (Config::getBool('organize_by_artist', true)) {
                                    $targetDir = rtrim($baseDir, '/\\') . '/' . $safeArtist . '/' . $safeAlbum;
                                } else {
                                    $targetDir = rtrim($baseDir, '/\\') . '/' . $safeAlbum;
                                }
                            }

                            if ($targetDir && is_string($targetDir)) {
                                if (!is_dir($targetDir)) {
                                    @mkdir($targetDir, 0755, true);
                                }
                                $destPath = rtrim($targetDir, '/\\') . '/' . basename($filePath);
                                if (realpath($destPath) !== realpath($filePath) && !file_exists($destPath)) {
                                    if (@rename($filePath, $destPath)) {
                                        $oldDir = dirname($filePath);
                                        $filePath = $destPath;
                                        // Actualizar ruta en base de datos
                                        $pdo->prepare("UPDATE history SET file_path = :fp WHERE id = :id")->execute([':fp' => $filePath, ':id' => $id]);
                                        // Limpiar carpeta anterior si quedó vacía
                                        if (is_dir($oldDir)) {
                                            $remaining = @scandir($oldDir);
                                            if (is_array($remaining) && count(array_diff($remaining, ['.', '..'])) === 0) {
                                                @rmdir($oldDir);
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (\Throwable) {}
                    }

                    try {
                        $cachedCover = dirname(__DIR__) . "/storage/covers/{$id}.jpg";
                        $coverPath = file_exists($cachedCover) ? $cachedCover : null;
                        $tagger = new \Sounify\Tagging\Id3Writer();
                        $tagger->tagAudio($filePath, [
                            'title' => $title,
                            'artist' => $artist,
                            'album' => $album,
                            'album_artist' => $albumArtist,
                            'year' => $year,
                            'genre' => $genre,
                        ], $coverPath);
                        $fileTagged = true;
                    } catch (\Throwable $e) {}
                }

                // Notificar a Navidrome si auto scan está activo
                if (Config::getBool('navidrome_enabled', false) && Config::getBool('navidrome_auto_scan', true)) {
                    try {
                        $navidrome = new NavidromeClient(
                            Config::get('navidrome_url', 'http://127.0.0.1:4533'),
                            Config::get('navidrome_user', ''),
                            Config::get('navidrome_pass', '')
                        );
                        $navidrome->startScan();
                    } catch (\Throwable) {}
                }

                echo json_encode([
                    'success' => true,
                    'message' => 'Track metadata updated successfully.',
                    'file_tagged' => $fileTagged,
                    'track' => [
                        'id' => $id,
                        'title' => $title,
                        'artist' => $artist,
                        'album' => $album,
                        'album_artist' => $albumArtist,
                        'year' => $year,
                        'genre' => $genre,
                    ]
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                return;

            case '/api/library/bulk-update':
                if ($method !== 'POST') {
                    $this->setResponseCode(405);
                    echo json_encode(['error' => true, 'message' => 'Method not allowed']);
                    return;
                }
                $ids = $input['ids'] ?? [];
                if (!is_array($ids) || empty($ids)) {
                    $this->setResponseCode(400);
                    echo json_encode(['error' => true, 'message' => 'Track IDs are required']);
                    return;
                }

                $fieldsToUpdate = [];
                $params = [];
                if (isset($input['album']) && trim((string)$input['album']) !== '') {
                    $fieldsToUpdate[] = "album = ?";
                    $params[] = trim((string)$input['album']);
                }
                if (isset($input['album_artist']) && trim((string)$input['album_artist']) !== '') {
                    $fieldsToUpdate[] = "album_artist = ?";
                    $params[] = trim((string)$input['album_artist']);
                }
                if (isset($input['artist']) && trim((string)$input['artist']) !== '') {
                    $fieldsToUpdate[] = "artist = ?";
                    $params[] = trim((string)$input['artist']);
                }
                if (isset($input['year']) && trim((string)$input['year']) !== '') {
                    $fieldsToUpdate[] = "year = ?";
                    $params[] = trim((string)$input['year']);
                }
                if (isset($input['genre']) && trim((string)$input['genre']) !== '') {
                    $fieldsToUpdate[] = "genre = ?";
                    $params[] = trim((string)$input['genre']);
                }

                if (empty($fieldsToUpdate)) {
                    $this->setResponseCode(400);
                    echo json_encode(['error' => true, 'message' => 'No fields to update']);
                    return;
                }

                $pdo = Database::get();
                $sanitizedIds = array_values(array_unique(array_filter(array_map('intval', $ids))));
                if (empty($sanitizedIds)) {
                    $this->setResponseCode(400);
                    echo json_encode(['error' => true, 'message' => 'Invalid track IDs']);
                    return;
                }

                $placeholders = implode(',', array_fill(0, count($sanitizedIds), '?'));
                $updateSql = "UPDATE history SET " . implode(', ', $fieldsToUpdate) . " WHERE id IN ({$placeholders})";
                $stmt = $pdo->prepare($updateSql);
                $allValues = array_merge($params, $sanitizedIds);
                $stmt->execute($allValues);

                // Actualizar tags ID3 físicos de cada archivo
                $tagger = new \Sounify\Tagging\Id3Writer();
                $fetchStmt = $pdo->prepare("SELECT * FROM history WHERE id IN ({$placeholders})");
                $fetchStmt->execute($sanitizedIds);
                $updatedTracks = $fetchStmt->fetchAll();
                $taggedCount = 0;
                foreach ($updatedTracks as $t) {
                    $fp = (string)($t['file_path'] ?? '');
                    if ($fp !== '' && file_exists($fp) && is_file($fp)) {
                        try {
                            $tagger->tagAudio($fp, [
                                'title' => $t['title'],
                                'artist' => $t['artist'],
                                'album' => $t['album'],
                                'year' => $t['year'],
                                'genre' => $t['genre'],
                            ]);
                            $taggedCount++;
                        } catch (\Throwable) {}
                    }
                }

                if (Config::getBool('navidrome_enabled', false) && Config::getBool('navidrome_auto_scan', true)) {
                    try {
                        $navidrome = new NavidromeClient(
                            Config::get('navidrome_url', 'http://127.0.0.1:4533'),
                            Config::get('navidrome_user', ''),
                            Config::get('navidrome_pass', '')
                        );
                        $navidrome->startScan();
                    } catch (\Throwable) {}
                }

                echo json_encode([
                    'success' => true,
                    'message' => count($sanitizedIds) . ' tracks updated successfully.',
                    'count' => count($sanitizedIds),
                    'updated' => count($sanitizedIds),
                    'tagged_files' => $taggedCount
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                return;

            case '/api/library/bulk-delete':
                if ($method !== 'POST') {
                    $this->setResponseCode(405);
                    echo json_encode(['error' => true, 'message' => 'Method not allowed']);
                    return;
                }
                $ids = $input['ids'] ?? [];
                if (!is_array($ids) || empty($ids)) {
                    $this->setResponseCode(400);
                    echo json_encode(['error' => true, 'message' => 'Track IDs are required']);
                    return;
                }

                $pdo = Database::get();
                $sanitizedIds = array_values(array_unique(array_filter(array_map('intval', $ids))));
                if (empty($sanitizedIds)) {
                    $this->setResponseCode(400);
                    echo json_encode(['error' => true, 'message' => 'Invalid track IDs']);
                    return;
                }

                $placeholders = implode(',', array_fill(0, count($sanitizedIds), '?'));
                $fetchStmt = $pdo->prepare("SELECT id, file_path FROM history WHERE id IN ({$placeholders})");
                $fetchStmt->execute($sanitizedIds);
                $tracks = $fetchStmt->fetchAll();

                $deletedFiles = 0;
                $cacheDir = dirname(__DIR__) . '/storage/covers';
                foreach ($tracks as $t) {
                    $fp = (string)($t['file_path'] ?? '');
                    if ($fp !== '' && file_exists($fp) && is_file($fp)) {
                        if (@unlink($fp)) {
                            $deletedFiles++;
                        }
                    }
                    $cPath = "{$cacheDir}/{$t['id']}.jpg";
                    if (file_exists($cPath)) {
                        @unlink($cPath);
                    }
                }

                $delStmt = $pdo->prepare("DELETE FROM history WHERE id IN ({$placeholders})");
                $delStmt->execute($sanitizedIds);

                if (Config::getBool('navidrome_enabled', false) && Config::getBool('navidrome_auto_scan', true)) {
                    try {
                        $navidrome = new NavidromeClient(
                            Config::get('navidrome_url', 'http://127.0.0.1:4533'),
                            Config::get('navidrome_user', ''),
                            Config::get('navidrome_pass', '')
                        );
                        $navidrome->startScan();
                    } catch (\Throwable) {}
                }

                echo json_encode([
                    'success' => true,
                    'message' => count($sanitizedIds) . ' tracks deleted from library and disk.',
                    'deleted_count' => count($sanitizedIds),
                    'deleted' => count($sanitizedIds),
                    'files_deleted' => $deletedFiles
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                return;

            case '/api/resolve':
                $url = trim($input['url'] ?? ($_GET['url'] ?? ''));
                if (!$url) {
                    $this->setResponseCode(400);
                    echo json_encode(['error' => 'URL is required']);
                    return;
                }
                $scraper = new SpotifyScraper();
                $data = $scraper->resolve($url);
                $enricher = new MetadataEnricher();
                if ($data['type'] === 'track') {
                    $data = $enricher->enrich($data);
                } elseif (!empty($data['tracks'])) {
                    // Propagate genre and year only for albums; playlists preserve individual track metadata
                    if ($data['type'] === 'album') {
                        $first = $enricher->enrich($data['tracks'][0]);
                        $data['genre'] = $first['genre'] ?? '';
                        if (empty($data['year']) && !empty($first['year'])) {
                            $data['year'] = $first['year'];
                        }
                        foreach ($data['tracks'] as &$t) {
                            if (empty($t['genre'])) $t['genre'] = $data['genre'];
                            if (empty($t['year']) && !empty($data['year'])) $t['year'] = $data['year'];
                        }
                        unset($t);
                    }
                }
                echo json_encode(['success' => true, 'data' => $data], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                return;

            case '/api/download':
                $track = $input['track'] ?? null;
                if (!$track) {
                    $this->setResponseCode(400);
                    echo json_encode(['error' => 'Track data is required']);
                    return;
                }

                $jobId = uniqid('job_', true);
                $pdo = Database::get();
                $stmt = $pdo->prepare("
                    INSERT INTO jobs (id, spotify_id, title, artist, album, duration, cover_url, status, progress, message)
                    VALUES (:id, :sid, :t, :a, :alb, :d, :c, 'pending', 0, 'Queued...')
                ");
                $stmt->execute([
                    ':id' => $jobId,
                    ':sid' => $track['id'] ?? null,
                    ':t' => $track['title'] ?? $track['name'] ?? 'Unknown',
                    ':a' => $track['artist'] ?? 'Unknown',
                    ':alb' => $track['album'] ?? $track['album_name'] ?? '',
                    ':d' => (int) ($track['duration'] ?? 0),
                    ':c' => $track['cover_url'] ?? '',
                ]);

                // Synchronous processing
                $downloader = new AudioDownloader();
                try {
                    $outputPath = $downloader->processJob($jobId, $track);
                    echo json_encode([
                        'success' => true,
                        'job_id' => $jobId,
                        'output_path' => $outputPath
                    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                } catch (\Throwable $e) {
                    $stmtErr = $pdo->prepare("UPDATE jobs SET status = 'error', message = :m WHERE id = :id");
                    $stmtErr->execute([':m' => $e->getMessage(), ':id' => $jobId]);
                    $this->setResponseCode(500);
                    echo json_encode(['error' => true, 'message' => $e->getMessage()]);
                }
                return;

            case '/api/jobs':
                $pdo = Database::get();
                $stmt = $pdo->query("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50");
                echo json_encode(['success' => true, 'jobs' => $stmt->fetchAll()]);
                return;

            case '/api/history':
                $pdo = Database::get();
                $stmt = $pdo->query("SELECT * FROM history ORDER BY downloaded_at DESC LIMIT 100");
                echo json_encode(['success' => true, 'history' => $stmt->fetchAll()]);
                return;

            case '/api/cover':
                $id = (int) ($_GET['id'] ?? 0);
                $album = trim((string)($_GET['album'] ?? ''));
                $coverPath = null;
                $pdo = Database::get();

                $cacheDir = dirname(__DIR__) . '/storage/covers';
                if (!is_dir($cacheDir)) {
                    @mkdir($cacheDir, 0755, true);
                }

                if ($id > 0) {
                    $cachedFile = "{$cacheDir}/{$id}.jpg";
                    if (file_exists($cachedFile) && filesize($cachedFile) > 400) {
                        $coverPath = $cachedFile;
                    } else {
                        $stmt = $pdo->prepare("SELECT * FROM history WHERE id = :id LIMIT 1");
                        $stmt->execute([':id' => $id]);
                        $t = $stmt->fetch();
                        if ($t) {
                            $fp = (string)($t['file_path'] ?? '');
                            if ($fp !== '' && file_exists($fp)) {
                                $dir = dirname($fp);
                                $base = pathinfo($fp, PATHINFO_FILENAME);
                                foreach (["{$dir}/cover.jpg", "{$dir}/cover.png", "{$dir}/{$base}.jpg", "{$dir}/folder.jpg"] as $img) {
                                    if (file_exists($img) && filesize($img) > 400) {
                                        $coverPath = $img;
                                        break;
                                    }
                                }
                                // Extraer portada incrustada del audio mediante ffmpeg
                                if (!$coverPath) {
                                    $ffmpeg = CommandHelper::getFfmpeg();
                                    $cmd = sprintf('%s -y -i %s -an -vcodec copy -frames:v 1 -update 1 %s 2>&1',
                                        escapeshellarg($ffmpeg),
                                        escapeshellarg($fp),
                                        escapeshellarg($cachedFile)
                                    );
                                    @exec($cmd);
                                    if (file_exists($cachedFile) && filesize($cachedFile) > 400) {
                                        $coverPath = $cachedFile;
                                    }
                                }
                            }
                            // Fallback a URL de portada original de Spotify si ffmpeg no extrajo imagen
                            if (!$coverPath) {
                                $coverUrl = (string)($t['cover_url'] ?? '');
                                if (!$coverUrl && !empty($t['title'])) {
                                    $stmtC = $pdo->prepare("SELECT cover_url FROM jobs WHERE title = :t AND cover_url IS NOT NULL AND cover_url != '' ORDER BY created_at DESC LIMIT 1");
                                    $stmtC->execute([':t' => $t['title']]);
                                    $coverUrl = (string)$stmtC->fetchColumn();
                                }
                                if ($coverUrl) {
                                    $cData = $this->fetchRemoteUrl($coverUrl);
                                    if ($cData && strlen($cData) > 500) {
                                        @file_put_contents($cachedFile, $cData);
                                        if (file_exists($cachedFile) && filesize($cachedFile) > 400) {
                                            $coverPath = $cachedFile;
                                        }
                                    }
                                }
                            }
                        }
                    }
                } elseif ($album !== '') {
                    $stmt = $pdo->prepare("SELECT * FROM history WHERE album = :album AND file_path IS NOT NULL LIMIT 1");
                    $stmt->execute([':album' => $album]);
                    $t = $stmt->fetch();
                    if ($t) {
                        $tid = (int)$t['id'];
                        $cachedFile = "{$cacheDir}/{$tid}.jpg";
                        if (file_exists($cachedFile) && filesize($cachedFile) > 400) {
                            $coverPath = $cachedFile;
                        } else {
                            $fp = (string)($t['file_path'] ?? '');
                            if ($fp !== '' && file_exists($fp)) {
                                $dir = dirname($fp);
                                $base = pathinfo($fp, PATHINFO_FILENAME);
                                foreach (["{$dir}/cover.jpg", "{$dir}/cover.png", "{$dir}/{$base}.jpg", "{$dir}/folder.jpg"] as $img) {
                                    if (file_exists($img) && filesize($img) > 400) {
                                        $coverPath = $img;
                                        break;
                                    }
                                }
                                if (!$coverPath) {
                                    $ffmpeg = CommandHelper::getFfmpeg();
                                    $cmd = sprintf('%s -y -i %s -an -vcodec copy -frames:v 1 -update 1 %s 2>&1',
                                        escapeshellarg($ffmpeg),
                                        escapeshellarg($fp),
                                        escapeshellarg($cachedFile)
                                    );
                                    @exec($cmd);
                                    if (file_exists($cachedFile) && filesize($cachedFile) > 400) {
                                        $coverPath = $cachedFile;
                                    }
                                }
                            }
                            if (!$coverPath) {
                                $coverUrl = (string)($t['cover_url'] ?? '');
                                if (!$coverUrl && !empty($t['album'])) {
                                    $stmtC = $pdo->prepare("SELECT cover_url FROM jobs WHERE album = :alb AND cover_url IS NOT NULL AND cover_url != '' ORDER BY created_at DESC LIMIT 1");
                                    $stmtC->execute([':alb' => $t['album']]);
                                    $coverUrl = (string)$stmtC->fetchColumn();
                                }
                                if ($coverUrl) {
                                    $cData = $this->fetchRemoteUrl($coverUrl);
                                    if ($cData && strlen($cData) > 500) {
                                        @file_put_contents($cachedFile, $cData);
                                        if (file_exists($cachedFile) && filesize($cachedFile) > 400) {
                                            $coverPath = $cachedFile;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if ($coverPath && file_exists($coverPath) && filesize($coverPath) > 200) {
                    $mime = str_ends_with(strtolower($coverPath), '.png') ? 'image/png' : 'image/jpeg';
                    $this->setHeader("Content-Type: {$mime}");
                    $this->setHeader('Cache-Control: public, max-age=86400');
                    readfile($coverPath);
                    return;
                }

                // Default SVG artwork placeholder (sin caché para permitir actualización inmediata)
                $this->setHeader('Content-Type: image/svg+xml');
                $this->setHeader('Cache-Control: no-cache, no-store, must-revalidate');
                echo '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#242424"/><stop offset="100%" stop-color="#121212"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="150" cy="150" r="46" fill="#181818"/><path d="M140 166V126l32-9v49m-32 0a12 12 0 1 1-12-12 12 12 0 0 1 12 12zm32-9a12 12 0 1 1-12-12 12 12 0 0 1 12 12z" fill="#1ed760"/></svg>';
                return;

            case '/api/stream':
                $id = (int) ($_GET['id'] ?? ($input['id'] ?? 0));
                $pdo = Database::get();
                $stmt = $pdo->prepare("SELECT file_path, format FROM history WHERE id = :id LIMIT 1");
                $stmt->execute([':id' => $id]);
                $track = $stmt->fetch();
                if (!$track || empty($track['file_path']) || !file_exists($track['file_path'])) {
                    $this->setResponseCode(404);
                    echo json_encode(['error' => 'Audio file not found on disk']);
                    return;
                }

                $filePath = (string) $track['file_path'];
                $fileSize = (int) filesize($filePath);
                $ext = strtolower($track['format'] ?? pathinfo($filePath, PATHINFO_EXTENSION));
                $mimeType = match ($ext) {
                    'mp3' => 'audio/mpeg',
                    'flac' => 'audio/flac',
                    'm4a' => 'audio/mp4',
                    'wav' => 'audio/wav',
                    'aac' => 'audio/aac',
                    'opus', 'ogg' => 'audio/ogg',
                    default => 'audio/mpeg',
                };

                if (ob_get_level()) {
                    @ob_end_clean();
                }

                $range = $_SERVER['HTTP_RANGE'] ?? null;
                if ($range && preg_match('/bytes=(\d+)-(\d*)/', $range, $matches)) {
                    $start = (int) $matches[1];
                    $end = ($matches[2] !== '') ? (int) $matches[2] : ($fileSize - 1);
                    if ($start > $end || $start >= $fileSize) {
                        $this->setResponseCode(416);
                        $this->setHeader("Content-Range: bytes */{$fileSize}");
                        return;
                    }
                    $length = $end - $start + 1;
                    $this->setResponseCode(206);
                    $this->setHeader("Content-Type: {$mimeType}");
                    $this->setHeader("Content-Range: bytes {$start}-{$end}/{$fileSize}");
                    $this->setHeader("Content-Length: {$length}");
                    $this->setHeader("Accept-Ranges: bytes");
                    $this->setHeader("Cache-Control: no-cache");

                    $fp = fopen($filePath, 'rb');
                    if ($fp !== false) {
                        fseek($fp, $start);
                        $bytesSent = 0;
                        while (!feof($fp) && $bytesSent < $length && connection_status() === 0) {
                            $chunkSize = min(16384, $length - $bytesSent);
                            $buffer = fread($fp, $chunkSize);
                            if ($buffer === false || $buffer === '') {
                                break;
                            }
                            echo $buffer;
                            flush();
                            $bytesSent += strlen($buffer);
                        }
                        fclose($fp);
                    }
                    return;
                }

                $this->setHeader("Content-Type: {$mimeType}");
                $this->setHeader("Content-Length: " . $fileSize);
                $this->setHeader("Accept-Ranges: bytes");
                $this->setHeader("Cache-Control: no-cache");
                readfile($filePath);
                return;

            case '/api/playlist/create-m3u':
                $name = trim($input['name'] ?? 'Playlist');
                $files = $input['files'] ?? [];
                if (empty($files)) {
                    $this->setResponseCode(400);
                    echo json_encode(['error' => 'No files provided for playlist']);
                    return;
                }
                $downloadDir = Config::getDownloadDir();
                $m3uPath = M3uWriter::write($name, $files, $downloadDir);
                echo json_encode(['success' => true, 'm3u_path' => $m3uPath]);
                return;

            case '/api/settings':
                if ($method === 'POST') {
                    if (isset($input['download_dir'])) {
                        $input['download_dir'] = rtrim(trim((string) $input['download_dir']), '/\\');
                    }
                    if (isset($input['navidrome_url'])) {
                        $input['navidrome_url'] = rtrim(trim((string) $input['navidrome_url']), '/');
                    }
                    Config::setMultiple($input);
                    echo json_encode(['success' => true, 'message' => 'Settings saved successfully']);
                } else {
                    echo json_encode(['success' => true, 'settings' => Config::getAll()]);
                }
                return;

            case '/api/navidrome/test':
                $client = new NavidromeClient(
                    $input['url'] ?? Config::get('navidrome_url', 'http://127.0.0.1:4533'),
                    $input['user'] ?? Config::get('navidrome_user', ''),
                    $input['pass'] ?? Config::get('navidrome_pass', '')
                );
                $res = $client->testConnection();
                echo json_encode($res);
                return;

            case '/api/navidrome/scan':
                $client = new NavidromeClient(
                    Config::get('navidrome_url', 'http://127.0.0.1:4533'),
                    Config::get('navidrome_user', ''),
                    Config::get('navidrome_pass', '')
                );
                $fullScan = !empty($input['full_scan']) || !empty($_POST['full_scan']) || !empty($_GET['full_scan']);
                $res = $client->startScan($fullScan);
                echo json_encode($res);
                return;

            case '/api/clear-completed':
                $pdo = Database::get();
                $pdo->exec("DELETE FROM jobs WHERE status IN ('done', 'error')");
                echo json_encode(['success' => true]);
                return;

            case '/api/database/clean':
                if ($method !== 'POST') {
                    $this->setResponseCode(405);
                    echo json_encode(['error' => 'Method not allowed']);
                    return;
                }

                $keepFiles = !empty($input['keep_files']);
                $pdo = Database::get();

                $deletedFilesCount = 0;
                if (!$keepFiles) {
                    $downloadDir = Config::getDownloadDir();
                    if (is_dir($downloadDir)) {
                        try {
                            $iterator = new \RecursiveIteratorIterator(
                                new \RecursiveDirectoryIterator($downloadDir, \RecursiveDirectoryIterator::SKIP_DOTS),
                                \RecursiveIteratorIterator::CHILD_FIRST
                            );
                            foreach ($iterator as $item) {
                                $real = $item->getRealPath() ?: $item->getPathname();
                                if ($item->isDir()) {
                                    @rmdir($real);
                                } elseif ($item->isFile()) {
                                    if (basename($real) === '.gitkeep') {
                                        continue;
                                    }
                                    if (file_exists($real) && @unlink($real)) {
                                        $deletedFilesCount++;
                                    }
                                }
                            }
                        } catch (\Throwable) {}
                    }

                    try {
                        $files = $pdo->query("SELECT file_path FROM history")->fetchAll(PDO::FETCH_COLUMN);
                        foreach ($files as $filePath) {
                            if ($filePath && file_exists($filePath) && is_file($filePath)) {
                                if (@unlink($filePath)) {
                                    $deletedFilesCount++;
                                }
                            }
                        }
                    } catch (\Throwable) {}
                }

                $pdo->beginTransaction();
                try {
                    $countJobs = $pdo->exec("DELETE FROM jobs");
                    $countHistory = $pdo->exec("DELETE FROM history");
                    try {
                        $pdo->exec("DELETE FROM sqlite_sequence WHERE name IN ('history', 'jobs')");
                    } catch (\Throwable) {}
                    $pdo->commit();
                } catch (\Throwable $e) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    throw $e;
                }

                // Limpiar también carátulas en storage/covers
                $coversDir = dirname(__DIR__) . '/storage/covers';
                if (is_dir($coversDir)) {
                    foreach (glob($coversDir . '/*.{jpg,jpeg,png,webp}', GLOB_BRACE) ?: [] as $cFile) {
                        if (basename($cFile) !== '.gitkeep') {
                            @unlink($cFile);
                        }
                    }
                }

                try {
                    $pdo->exec("VACUUM");
                } catch (\Throwable) {}

                echo json_encode([
                    'success' => true,
                    'message' => $keepFiles
                        ? "Database cleaned successfully. Removed {$countJobs} jobs and {$countHistory} history records. Audio files preserved."
                        : "Database cleaned and audio files removed. Removed {$countJobs} jobs, {$countHistory} history records, and {$deletedFilesCount} files.",
                    'jobs_cleared' => $countJobs,
                    'history_cleared' => $countHistory,
                    'files_deleted' => $deletedFilesCount,
                    'files_kept' => $keepFiles
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                return;

            default:
                $this->setResponseCode(404);
                echo json_encode(['error' => 'Endpoint not found']);
                return;
        }
    }
}
