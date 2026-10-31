<?php
declare(strict_types=1);

namespace Sounify\Playlist;

class M3uWriter
{
    public static function write(string $playlistName, array $downloadedFiles, string $baseDownloadDir): string
    {
        $safeName = preg_replace('/[\\/:*?"<>|]/', '', $playlistName);
        $safeName = trim(preg_replace('/\s+/', ' ', $safeName)) ?: 'Playlist';

        $playlistDir = rtrim($baseDownloadDir, '/') . '/Playlists';
        if (!is_dir($playlistDir)) {
            mkdir($playlistDir, 0755, true);
        }

        $m3uPath = "{$playlistDir}/{$safeName}.m3u";

        $lines = ["#EXTM3U", "#EXTSOUNIFY:playlist {$safeName}"];

        foreach ($downloadedFiles as $track) {
            if (is_string($track)) {
                $filePath = $track;
                $duration = 0;
                $artist = '';
                $title = pathinfo($track, PATHINFO_FILENAME);
            } else {
                $filePath = $track['file_path'] ?? '';
                $duration = (int) ($track['duration'] ?? 0);
                $artist = $track['artist'] ?? '';
                $title = $track['title'] ?? pathinfo($filePath, PATHINFO_FILENAME);
            }

            if (!file_exists($filePath)) {
                continue;
            }

            // Ruta relativa desde la carpeta Playlists/
            $relPath = self::getRelativePath($playlistDir, $filePath);

            $label = $artist !== '' ? "{$artist} - {$title}" : $title;
            $lines[] = "#EXTINF:{$duration},{$label}";
            $lines[] = $relPath;
        }

        file_put_contents($m3uPath, implode("\n", $lines) . "\n");

        return $m3uPath;
    }

    private static function getRelativePath(string $from, string $to): string
    {
        $from = str_replace('\\', '/', realpath($from) ?: $from);
        $to = str_replace('\\', '/', realpath($to) ?: $to);

        $fromParts = explode('/', rtrim($from, '/'));
        $toParts = explode('/', rtrim($to, '/'));

        // Cross-drive check on Windows (e.g. C: vs D:)
        if (isset($fromParts[0], $toParts[0]) && str_ends_with($fromParts[0], ':') && str_ends_with($toParts[0], ':')) {
            if (strcasecmp($fromParts[0], $toParts[0]) !== 0) {
                return $to;
            }
        }

        while (count($fromParts) && count($toParts) && ($fromParts[0] === $toParts[0])) {
            array_shift($fromParts);
            array_shift($toParts);
        }

        $rel = str_repeat('../', count($fromParts)) . implode('/', $toParts);
        return $rel ?: basename($to);
    }
}
