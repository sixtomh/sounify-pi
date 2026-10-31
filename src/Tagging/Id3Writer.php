<?php
declare(strict_types=1);

namespace Sounify\Tagging;

class Id3Writer
{
    /**
     * Escribe metadatos y carátula usando ffmpeg.
     */
    public function tagAudio(string $audioFile, array $song, ?string $coverImagePath = null): void
    {
        if (!file_exists($audioFile)) {
            return;
        }

        $ext = strtolower(pathinfo($audioFile, PATHINFO_EXTENSION));
        $tempFile = $audioFile . '.tagging_tmp.' . $ext;

        $ffmpegBin = \Sounify\CommandHelper::getFfmpeg();
        $cmd = [$ffmpegBin, '-y', '-i', $audioFile];

        $supportsAttachedPic = in_array($ext, ['mp3', 'flac', 'm4a'], true);
        if ($coverImagePath && file_exists($coverImagePath) && $supportsAttachedPic) {
            $cmd[] = '-i';
            $cmd[] = $coverImagePath;
            $cmd[] = '-map';
            $cmd[] = '0:a';
            $cmd[] = '-map';
            $cmd[] = '1:0';
            $cmd[] = '-c';
            $cmd[] = 'copy';
            $cmd[] = '-disposition:v:0';
            $cmd[] = 'attached_pic';
        } else {
            $cmd[] = '-c';
            $cmd[] = 'copy';
        }

        // Metadatos estándar (Separador ';' para multi-artistas en Navidrome)
        $title = $song['title'] ?? $song['name'] ?? '';

        $artistsList = [];
        if (!empty($song['artists']) && is_array($song['artists'])) {
            $artistsList = array_values(array_filter(array_map('trim', $song['artists'])));
        } elseif (!empty($song['artist'])) {
            $artistsList = array_values(array_filter(array_map('trim', preg_split('/[;,]/', (string) $song['artist']))));
        }

        $artist = !empty($artistsList) ? implode('; ', $artistsList) : ($song['artist'] ?? '');
        $albumArtist = !empty($artistsList[0]) ? $artistsList[0] : $artist;

        $album = trim($song['album'] ?? $song['album_name'] ?? '');
        if ($album === '' || strtolower($album) === 'single') {
            $album = $title;
        }
        $year = substr($song['release_date'] ?? ($song['year'] ?? ''), 0, 4);
        $genre = trim($song['genre'] ?? '');

        if ($title !== '') {
            $cmd[] = '-metadata';
            $cmd[] = "title={$title}";
        }
        if ($artist !== '') {
            $cmd[] = '-metadata';
            $cmd[] = "artist={$artist}";
            $cmd[] = '-metadata';
            $cmd[] = "ARTIST={$artist}";
        }
        if ($albumArtist !== '') {
            $cmd[] = '-metadata';
            $cmd[] = "album_artist={$albumArtist}";
            $cmd[] = '-metadata';
            $cmd[] = "albumartist={$albumArtist}";
            $cmd[] = '-metadata';
            $cmd[] = "TPE2={$albumArtist}";
        }
        if ($album !== '') {
            $cmd[] = '-metadata';
            $cmd[] = "album={$album}";
        }
        if ($year !== '') {
            $cmd[] = '-metadata';
            $cmd[] = "date={$year}";
            $cmd[] = '-metadata';
            $cmd[] = "year={$year}";
            $cmd[] = '-metadata';
            $cmd[] = "TYER={$year}";
        }
        if ($genre !== '') {
            $cmd[] = '-metadata';
            $cmd[] = "genre={$genre}";
            $cmd[] = '-metadata';
            $cmd[] = "TCON={$genre}";
        }
        if (!empty($song['order'])) {
            $cmd[] = '-metadata';
            $cmd[] = "track={$song['order']}";
        }

        if ($ext === 'mp3') {
            $cmd[] = '-id3v2_version';
            $cmd[] = '3';
        }

        $cmd[] = $tempFile;

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w']
        ];

        $process = @proc_open($cmd, $descriptors, $pipes);
        if (is_resource($process)) {
            fclose($pipes[0]);
            stream_get_contents($pipes[1]);
            stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            $returnCode = proc_close($process);
        } else {
            $returnCode = 1;
        }

        if ($returnCode === 0 && file_exists($tempFile) && filesize($tempFile) > 1000) {
            @unlink($audioFile);
            @rename($tempFile, $audioFile);
        } else {
            if (file_exists($tempFile)) {
                @unlink($tempFile);
            }
        }
    }
}
