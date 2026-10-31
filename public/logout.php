<?php
declare(strict_types=1);

if (session_status() === PHP_SESSION_NONE) {
    @session_start([
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax',
    ]);
}

$_SESSION = [];
unset($_SESSION['sounify_authenticated']);
unset($_SESSION['sounify_user']);

if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        [
            'expires' => time() - 42000,
            'path' => $params["path"] ?: '/',
            'domain' => $params["domain"] ?? '',
            'secure' => $params["secure"] ?? false,
            'httponly' => true,
            'samesite' => 'Lax',
        ]
    );
}

@session_destroy();
@session_write_close();

header('Location: /login.php');
exit;
