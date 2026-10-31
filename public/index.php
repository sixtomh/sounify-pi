<?php
declare(strict_types=1);

// Servir archivos estáticos directamente si se usa como router en php -S
if (php_sapi_name() === 'cli-server') {
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $file = __DIR__ . $uri;
    if (is_dir($file) && file_exists($file . '/index.html')) {
        $file = $file . '/index.html';
    }
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    if ($uri !== '/' && $uri !== '/index.php' && file_exists($file) && !is_dir($file)) {
        if (in_array($ext, ['css', 'js', 'svg', 'png', 'jpg', 'jpeg', 'ico', 'webp', 'woff', 'woff2', 'ttf', 'html', 'htm', 'map', 'txt'], true)) {
            return false;
        }
    }
}

require_once __DIR__ . '/../src/App.php';

Sounify\App::registerAutoloader();

$app = new Sounify\App();
$app->run();
