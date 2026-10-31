<?php
declare(strict_types=1);

namespace Sounify\Integrations;

class NavidromeClient
{
    private string $baseUrl;
    private string $user;
    private string $password;

    public function __construct(string $baseUrl, string $user, string $password)
    {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->user = $user;
        $this->password = $password;
    }

    /**
     * Prueba la conexión con el servidor Navidrome
     */
    public function testConnection(): array
    {
        if (empty($this->baseUrl) || empty($this->user)) {
            return [
                'success' => false,
                'message' => 'Connection parameters missing (URL or username).'
            ];
        }

        try {
            $resp = $this->request('ping.view');
            $status = $resp['subsonic-response']['status'] ?? '';
            $version = $resp['subsonic-response']['serverVersion'] ?? $resp['subsonic-response']['version'] ?? 'unknown';

            if ($status === 'ok') {
                return [
                    'success' => true,
                    'message' => "Successfully connected to Navidrome (API version: {$version})."
                ];
            }

            $errMsg = $resp['subsonic-response']['error']['message'] ?? 'Unknown error';
            return [
                'success' => false,
                'message' => "Navidrome error: {$errMsg}"
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'message' => "Could not reach Navidrome: {$e->getMessage()}"
            ];
        }
    }

    /**
     * Trigger a library scan on Navidrome
     */
    public function startScan(): array
    {
        try {
            $resp = $this->request('startScan.view');
            $status = $resp['subsonic-response']['status'] ?? '';

            if ($status === 'ok') {
                return [
                    'success' => true,
                    'message' => 'Library scan initiated on Navidrome.'
                ];
            }

            $errMsg = $resp['subsonic-response']['error']['message'] ?? 'Unable to trigger scan';
            return [
                'success' => false,
                'message' => "Navidrome error: {$errMsg}"
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'message' => "Error triggering scan on Navidrome: {$e->getMessage()}"
            ];
        }
    }

    private function request(string $endpoint, array $extraParams = []): array
    {
        $salt = bin2hex(random_bytes(6));
        $token = md5($this->password . $salt);

        $params = array_merge([
            'u' => $this->user,
            't' => $token,
            's' => $salt,
            'v' => '1.16.1',
            'c' => 'sounify-pi',
            'f' => 'json'
        ], $extraParams);

        $url = "{$this->baseUrl}/rest/{$endpoint}?" . http_build_query($params);

        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException("Could not initialize cURL connection for {$endpoint}");
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => false,
        ]);

        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($res === false) {
            throw new \RuntimeException("Fallo de red: {$err}");
        }

        $data = json_decode((string) $res, true);
        if (!is_array($data)) {
            throw new \RuntimeException("Respuesta HTTP {$code} de Navidrome no es JSON.");
        }

        return $data;
    }
}
