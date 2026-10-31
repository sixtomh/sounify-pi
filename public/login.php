<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/App.php';
Sounify\App::registerAutoloader();

use Sounify\Config;

if (session_status() === PHP_SESSION_NONE) {
    session_start([
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax',
    ]);
}

// Si ya está iniciada la sesión, redirigir a la app
if (!empty($_SESSION['sounify_authenticated']) && $_SESSION['sounify_authenticated'] === true) {
    header('Location: /');
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');

    $validUser = Config::get('auth_username', 'admin');
    $validHash = Config::get('auth_password_hash', '');

    if ($username === $validUser && ($validHash !== '' && password_verify($password, $validHash))) {
        $_SESSION['sounify_authenticated'] = true;
        $_SESSION['sounify_user'] = $username;
        header('Location: /');
        exit;
    } else {
        $error = 'Incorrect username or password. Please try again.';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Log in · Sounify Pi</title>
  <meta name="description" content="Log in to Sounify Pi on your local network.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: #121212;
      color: #ffffff;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1.5rem;
      -webkit-font-smoothing: antialiased;
    }

    .login-container {
      width: 100%;
      max-width: 334px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    /* Sounify Logo Icon at Top (Spotify-inspired clean white) */
    .brand-icon-wrap {
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brand-icon {
      width: 44px;
      height: 44px;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brand-icon svg {
      width: 40px;
      height: 40px;
    }

    /* Big Bold "Welcome back" Title */
    h1.login-title {
      font-size: 2.15rem;
      font-weight: 800;
      letter-spacing: -0.04em;
      color: #ffffff;
      text-align: center;
      margin-bottom: 2rem;
      line-height: 1.15;
    }

    /* Form Layout */
    .login-form {
      width: 100%;
      display: flex;
      flex-direction: column;
    }

    .form-group {
      margin-bottom: 1.25rem;
      display: flex;
      flex-direction: column;
      width: 100%;
    }

    .form-group label {
      font-size: 0.88rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 0.5rem;
      text-align: left;
    }

    .input-wrapper {
      position: relative;
      width: 100%;
      display: flex;
      align-items: center;
    }

    .form-control {
      width: 100%;
      height: 48px;
      background-color: #121212;
      border: 1px solid #727272;
      border-radius: 4px;
      padding: 0 1rem;
      font-size: 1rem;
      color: #ffffff;
      font-family: inherit;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .input-wrapper .form-control {
      padding-right: 2.75rem;
    }

    .form-control:hover {
      border-color: #ffffff;
    }

    .form-control:focus {
      outline: none;
      border-color: #ffffff;
      box-shadow: 0 0 0 2px #ffffff;
    }

    .form-control::placeholder {
      color: #727272;
    }

    /* Password visibility toggle button */
    .btn-toggle-pass {
      position: absolute;
      right: 0.75rem;
      background: transparent;
      border: none;
      color: #b3b3b3;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.25rem;
      transition: color 0.15s ease;
    }

    .btn-toggle-pass:hover {
      color: #ffffff;
    }

    .btn-toggle-pass svg {
      width: 20px;
      height: 20px;
    }

    /* Spotify Big Green Pill Button ("Continue") */
    .btn-continue {
      width: 100%;
      height: 48px;
      background-color: #1ed760;
      color: #000000;
      border: none;
      border-radius: 500px;
      font-size: 1rem;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      margin-top: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.1s ease, background-color 0.15s ease;
    }

    .btn-continue:hover {
      background-color: #1fdf64;
      transform: scale(1.02);
    }

    .btn-continue:active {
      transform: scale(0.99);
      background-color: #169c46;
    }

    /* Error Message Box */
    .error-banner {
      width: 100%;
      background-color: #e91429;
      color: #ffffff;
      font-size: 0.88rem;
      font-weight: 600;
      padding: 0.75rem 1rem;
      border-radius: 4px;
      margin-bottom: 1.5rem;
      text-align: center;
      line-height: 1.35;
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 480px) {
      body {
        padding: 1.5rem 1rem;
      }
      h1.login-title {
        font-size: 1.75rem;
        margin-bottom: 1.5rem;
      }
      .login-container {
        max-width: 100%;
      }
    }

    /* Hint / Footer */
    .login-footer-info {
      margin-top: 2.25rem;
      text-align: center;
      font-size: 0.8rem;
      color: #727272;
      line-height: 1.5;
    }

    .login-footer-info code {
      font-family: 'JetBrains Mono', monospace;
      color: #1ed760;
      background: rgba(255, 255, 255, 0.06);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="login-container">
    
    <!-- Top Sounify Logo -->
    <div class="brand-icon-wrap">
      <div class="brand-icon" title="Sounify Pi">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>
      </div>
    </div>

    <!-- Big Spotify-Style Headline -->
    <h1 class="login-title">Welcome back</h1>

    <?php if (!empty($error)): ?>
      <div class="error-banner">
        <?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?>
      </div>
    <?php endif; ?>

    <!-- Login Form -->
    <form class="login-form" action="/login.php" method="POST" autocomplete="on">
      <div class="form-group">
        <label for="username">Email or username</label>
        <input 
          type="text" 
          id="username" 
          name="username" 
          class="form-control" 
          required 
          autocomplete="username" 
          autofocus 
          value="<?= htmlspecialchars($_POST['username'] ?? '', ENT_QUOTES, 'UTF-8') ?>"
        >
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <div class="input-wrapper">
          <input 
            type="password" 
            id="password" 
            name="password" 
            class="form-control" 
            required 
            autocomplete="current-password"
          >
          <button type="button" id="btn-toggle-pass" class="btn-toggle-pass" aria-label="Toggle password visibility" title="Show / Hide password">
            <svg id="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
        </div>
      </div>

      <button type="submit" class="btn-continue">
        Continue
      </button>

      <div class="login-footer-info">
        Default credentials: <code>admin</code> / <code>admin</code><br>
        Change credentials anytime in <strong>Settings</strong>
      </div>
    </form>
  </div>

  <script>
    const passInput = document.getElementById('password');
    const toggleBtn = document.getElementById('btn-toggle-pass');

    toggleBtn?.addEventListener('click', () => {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      toggleBtn.innerHTML = isPass
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    });
  </script>
</body>
</html>
