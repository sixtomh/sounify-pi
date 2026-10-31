<?php
declare(strict_types=1);

namespace Sounify;

use PDO;
use Sounify\Scraper\SpotifyScraper;
use Sounify\Downloader\AudioDownloader;
use Sounify\Playlist\M3uWriter;
use Sounify\Integrations\NavidromeClient;

class App
{
    public static function registerAutoloader(): void
    {
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

    public function run(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            @session_start([
                'cookie_httponly' => true,
                'cookie_samesite' => 'Lax',
            ]);
        }

        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
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
            header('Content-Type: application/json; charset=utf-8');
            try {
                $this->handleApi($uri, $method);
            } catch (\Throwable $e) {
                http_response_code(500);
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

        if ($realFile && is_dir($realFile) && file_exists($realFile . '/index.html')) {
            $realFile = realpath($realFile . '/index.html');
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
                header('Content-Type: ' . $mimes[$ext]);
                header('Cache-Control: public, max-age=3600');
                readfile($realFile);
                return;
            }
        }

        // Si se solicitó un archivo estático conocido que no existe, retornar 404 (nunca redirigir a login.php)
        $reqExt = strtolower(pathinfo($uri, PATHINFO_EXTENSION));
        if ($reqExt !== '' && isset($mimes[$reqExt]) && $reqExt !== 'html' && $reqExt !== 'htm') {
            http_response_code(404);
            header('Content-Type: text/plain; charset=utf-8');
            echo "Not Found: " . htmlspecialchars($uri);
            return;
        }

        // Si la autenticación está habilitada y no está autenticado, redirigir a login.php
        if (!$this->isAuthenticated()) {
            header('Location: /login.php');
            exit;
        }

        // Servir la vista principal de la aplicación
        $appView = dirname(__DIR__) . '/src/Views/index.html';
        header('Content-Type: text/html; charset=utf-8');
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
        $input = json_decode(file_get_contents('php://input'), true) ?? [];

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
                http_response_code(401);
                echo json_encode(['error' => true, 'message' => 'Usuario o contraseña incorrectos']);
            }
            return;
        }

        if ($uri === '/api/auth/logout' && $method === 'POST') {
            $_SESSION = [];
            unset($_SESSION['sounify_authenticated']);
            unset($_SESSION['sounify_user']);
            if (ini_get("session.use_cookies")) {
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

        // Si la autenticación está activa y no está autenticado, denegar acceso a la API
        if (!$this->isAuthenticated()) {
            http_response_code(401);
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
                http_response_code(400);
                echo json_encode(['error' => true, 'message' => 'La contraseña actual no es correcta']);
                return;
            }

            if ($newUsername !== '') {
                Config::set('auth_username', $newUsername);
                $_SESSION['sounify_user'] = $newUsername;
            }

            if ($newPassword !== '') {
                if (strlen($newPassword) < 4) {
                    http_response_code(400);
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

                echo json_encode([
                    'success' => true,
                    'stats' => [
                        'total_tracks' => $totalTracks,
                        'active_jobs' => $activeJobs,
                        'navidrome_enabled' => Config::getBool('navidrome_enabled', false),
                        'navidrome_url' => Config::get('navidrome_url', 'http://127.0.0.1:4533'),
                        'audio_format' => Config::get('audio_format', 'mp3'),
                        'recent_tracks' => $recent
                    ]
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                return;

            case '/api/library':
                $pdo = Database::get();
                $stmt = $pdo->query("SELECT * FROM history ORDER BY downloaded_at DESC");
                echo json_encode(['success' => true, 'tracks' => $stmt->fetchAll()]);
                return;

            case '/api/resolve':
                $url = trim($input['url'] ?? ($_GET['url'] ?? ''));
                if (!$url) {
                    http_response_code(400);
                    echo json_encode(['error' => 'URL is required']);
                    return;
                }
                $scraper = new SpotifyScraper();
                $data = $scraper->resolve($url);
                $enricher = new \Sounify\Metadata\MetadataEnricher();
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
                    http_response_code(400);
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
                    http_response_code(500);
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

            case '/api/stream':
                $id = (int) ($_GET['id'] ?? ($input['id'] ?? 0));
                $pdo = Database::get();
                $stmt = $pdo->prepare("SELECT file_path, format FROM history WHERE id = :id LIMIT 1");
                $stmt->execute([':id' => $id]);
                $track = $stmt->fetch();
                if (!$track || empty($track['file_path']) || !file_exists($track['file_path'])) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Audio file not found on disk']);
                    return;
                }

                $filePath = $track['file_path'];
                $fileSize = (int) filesize($filePath);
                $ext = strtolower($track['format'] ?? pathinfo($filePath, PATHINFO_EXTENSION));
                $mimeType = match ($ext) {
                    'mp3' => 'audio/mpeg',
                    'flac' => 'audio/flac',
                    'm4a' => 'audio/mp4',
                    'opus', 'ogg' => 'audio/ogg',
                    default => 'audio/mpeg',
                };

                if (ob_get_level()) {
                    ob_end_clean();
                }

                $range = $_SERVER['HTTP_RANGE'] ?? null;
                if ($range && preg_match('/bytes=(\d+)-(\d*)/', $range, $matches)) {
                    $start = (int) $matches[1];
                    $end = ($matches[2] !== '') ? (int) $matches[2] : ($fileSize - 1);
                    if ($start > $end || $start >= $fileSize) {
                        http_response_code(416);
                        header("Content-Range: bytes */{$fileSize}");
                        return;
                    }
                    $length = $end - $start + 1;
                    http_response_code(206);
                    header("Content-Type: {$mimeType}");
                    header("Content-Range: bytes {$start}-{$end}/{$fileSize}");
                    header("Content-Length: {$length}");
                    header("Accept-Ranges: bytes");
                    header("Cache-Control: no-cache");

                    $fp = fopen($filePath, 'rb');
                    fseek($fp, $start);
                    $bytesSent = 0;
                    while (!feof($fp) && $bytesSent < $length && connection_status() === 0) {
                        $chunk = min(16384, $length - $bytesSent);
                        echo fread($fp, $chunk);
                        flush();
                        $bytesSent += $chunk;
                    }
                    fclose($fp);
                    return;
                }

                header("Content-Type: {$mimeType}");
                header("Content-Length: " . $fileSize);
                header("Accept-Ranges: bytes");
                header("Cache-Control: no-cache");
                readfile($filePath);
                return;

            case '/api/playlist/create-m3u':
                $name = trim($input['name'] ?? 'Playlist');
                $files = $input['files'] ?? [];
                if (empty($files)) {
                    http_response_code(400);
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
                $res = $client->startScan();
                echo json_encode($res);
                return;

            case '/api/clear-completed':
                $pdo = Database::get();
                $pdo->exec("DELETE FROM jobs WHERE status IN ('done', 'error')");
                echo json_encode(['success' => true]);
                return;

            case '/api/database/clean':
                if ($method !== 'POST') {
                    http_response_code(405);
                    echo json_encode(['error' => 'Method not allowed']);
                    return;
                }

                $keepFiles = !empty($input['keep_files']);
                $pdo = Database::get();

                $deletedFilesCount = 0;
                if (!$keepFiles) {
                    $downloadDir = Config::getDownloadDir();
                    if (is_dir($downloadDir)) {
                        $iterator = new \RecursiveIteratorIterator(
                            new \RecursiveDirectoryIterator($downloadDir, \RecursiveDirectoryIterator::SKIP_DOTS),
                            \RecursiveIteratorIterator::CHILD_FIRST
                        );
                        foreach ($iterator as $item) {
                            $real = $item->getRealPath() ?: $item->getPathname();
                            if ($item->isDir()) {
                                @rmdir($real);
                            } elseif ($item->isFile()) {
                                if (file_exists($real) && @unlink($real)) {
                                    $deletedFilesCount++;
                                }
                            }
                        }
                    }

                    $files = $pdo->query("SELECT file_path FROM history")->fetchAll(PDO::FETCH_COLUMN);
                    foreach ($files as $filePath) {
                        if ($filePath && file_exists($filePath) && is_file($filePath)) {
                            if (@unlink($filePath)) {
                                $deletedFilesCount++;
                            }
                        }
                    }
                }

                $countJobs = $pdo->exec("DELETE FROM jobs");
                $countHistory = $pdo->exec("DELETE FROM history");
                $pdo->exec("DELETE FROM sqlite_sequence WHERE name IN ('history', 'jobs')");
                $pdo->exec("VACUUM");

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
                http_response_code(404);
                echo json_encode(['error' => 'Endpoint not found']);
                return;
        }
    }
}
