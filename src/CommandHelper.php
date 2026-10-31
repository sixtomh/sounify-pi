<?php
declare(strict_types=1);

namespace Sounify;

class CommandHelper
{
    private static ?string $ytDlpCmd = null;
    private static ?string $ffmpegCmd = null;

    public static function getYtDlp(): string
    {
        if (self::$ytDlpCmd !== null) {
            return self::$ytDlpCmd;
        }

        $candidates = [
            'yt-dlp',
            'python -m yt_dlp',
            'python3 -m yt_dlp',
            '/usr/local/bin/yt-dlp',
            '/usr/bin/yt-dlp'
        ];

        if (PHP_OS_FAMILY === 'Windows') {
            $localApp = getenv('LOCALAPPDATA');
            if ($localApp) {
                foreach (glob("{$localApp}\\Programs\\Python\\Python*\\Scripts\\yt-dlp.exe") ?: [] as $p) {
                    $candidates[] = $p;
                }
                foreach (glob("{$localApp}\\Microsoft\\WinGet\\Packages\\*yt-dlp*\\*\\yt-dlp.exe") ?: [] as $p) {
                    $candidates[] = $p;
                }
            }
            $appData = getenv('APPDATA');
            if ($appData) {
                foreach (glob("{$appData}\\Python\\Python*\\Scripts\\yt-dlp.exe") ?: [] as $p) {
                    $candidates[] = $p;
                }
            }
        }

        foreach ($candidates as $cand) {
            $execCmd = (str_contains($cand, ' ') && !str_starts_with($cand, 'python')) ? ('"' . $cand . '"') : $cand;
            $test = @shell_exec("{$execCmd} --version 2>&1");
            if ($test && preg_match('/^\d{4}\.\d{2}\.\d{2}/', trim($test))) {
                self::$ytDlpCmd = $execCmd;
                return self::$ytDlpCmd;
            }
        }

        self::$ytDlpCmd = 'yt-dlp';
        return self::$ytDlpCmd;
    }

    public static function getFfmpeg(): string
    {
        if (self::$ffmpegCmd !== null) {
            return self::$ffmpegCmd;
        }

        $candidates = [
            'ffmpeg',
            '/usr/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
        ];

        if (PHP_OS_FAMILY === 'Windows') {
            $wingetDir = getenv('LOCALAPPDATA') . '\\Microsoft\\WinGet\\Packages';
            if (is_dir($wingetDir)) {
                $found = glob("{$wingetDir}\\*ffmpeg*\\*\\bin\\ffmpeg.exe");
                if (!empty($found)) {
                    array_unshift($candidates, $found[0]);
                }
            }
            $programFiles = getenv('ProgramFiles');
            if ($programFiles) {
                foreach (glob("{$programFiles}\\*ffmpeg*\\*\\bin\\ffmpeg.exe") ?: [] as $p) {
                    $candidates[] = $p;
                }
            }
        }

        foreach ($candidates as $cand) {
            $execCmd = ($cand === 'ffmpeg') ? 'ffmpeg' : ('"' . $cand . '"');
            $test = @shell_exec("{$execCmd} -version 2>&1");
            if ($test && str_contains($test, 'ffmpeg version')) {
                self::$ffmpegCmd = ($cand === 'ffmpeg') ? 'ffmpeg' : $cand;
                return self::$ffmpegCmd;
            }
        }

        self::$ffmpegCmd = 'ffmpeg';
        return self::$ffmpegCmd;
    }
}
