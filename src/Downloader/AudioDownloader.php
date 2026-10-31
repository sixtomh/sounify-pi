<?php
declare(strict_types=1);

namespace Sounify\Downloader;

use Sounify\Config;
use Sounify\Database;
use Sounify\Matcher\AudioMatcher;
use Sounify\Tagging\Id3Writer;
use Sounify\Integrations\NavidromeClient;

class AudioDownloader
{
    private AudioMatcher $matcher;
    private Id3Writer $tagger;
    private \Sounify\Metadata\MetadataEnricher $enricher;

    public function __construct()
    {
        $this->matcher = new AudioMatcher();
        $this->tagger = new Id3Writer();
        $this->enricher = new \Sounify\Metadata\MetadataEnricher();
    }

    public function processJob(string $jobId, array $song, ?callable $onProgress = null): string
    {
        $this->updateJob($jobId, 5.0, 'Enriching metadata (year & genre)...');
        $song = $this->enricher->enrich($song);

        // 1. Resolve audio match
        $this->updateJob($jobId, 10.0, 'Searching for best audio match...');
        $videoId = $song['video_id'] ?? null;
        if (!$videoId) {
            $videoId = $this->matcher->findBestMatch($song);
        }

        if (!$videoId) {
            throw new \RuntimeException("No audio match found on YouTube for: {$song['title']}");
        }

        // 2. Determine target path and filename
        $downloadDir = Config::getDownloadDir();
        $format = Config::get('audio_format', 'mp3');
        $bitrate = Config::get('audio_bitrate', '320');
        $organizeByArtist = Config::getBool('organize_by_artist', true);
        $organizeByAlbum = Config::getBool('organize_by_album', true);

        $rawTitle = trim($song['title'] ?? $song['name'] ?? 'Track');
        $rawAlbum = trim($song['album'] ?? $song['album_name'] ?? '');
        if ($rawAlbum === '' || strtolower($rawAlbum) === 'single') {
            $song['album'] = $rawTitle;
            $song['album_name'] = $rawTitle;
            $rawAlbum = $rawTitle;
        }

        $safeArtist = $this->sanitizeFilename($song['artist'] ?? 'Unknown Artist');
        $safeAlbum = $this->sanitizeFilename($rawAlbum);
        $safeTitle = $this->sanitizeFilename($rawTitle);

        $targetDir = rtrim($downloadDir, '/\\');
        if ($organizeByArtist && $organizeByAlbum && $safeAlbum !== '') {
            $targetDir .= '/' . $safeArtist . '/' . $safeAlbum;
        } elseif ($organizeByArtist) {
            $targetDir .= '/' . $safeArtist;
        } elseif ($organizeByAlbum && $safeAlbum !== '') {
            $targetDir .= '/' . $safeAlbum;
        }

        if (!is_dir($targetDir)) {
            mkdir($targetDir, 0755, true);
        }

        $filenameFormat = Config::get('filename_format', 'artist_title');
        $includeTrackNumber = Config::getBool('include_track_number', true);

        switch ($filenameFormat) {
            case 'title_artist':
                $namePattern = "{$safeTitle} - {$safeArtist}";
                break;
            case 'title':
                $namePattern = "{$safeTitle}";
                break;
            case 'artist_title':
            default:
                $namePattern = "{$safeArtist} - {$safeTitle}";
                break;
        }

        if ($includeTrackNumber && !empty($song['order'])) {
            $orderStr = str_pad((string) $song['order'], 2, '0', STR_PAD_LEFT);
            $baseFilename = "{$orderStr}. {$namePattern}";
        } else {
            $baseFilename = $namePattern;
        }

        $finalAudioPath = "{$targetDir}/{$baseFilename}.{$format}";

        // 3. Execute download with yt-dlp + ffmpeg
        $this->updateJob($jobId, 20.0, 'Downloading audio stream...');

        $tempTemplate = "{$targetDir}/temp_{$jobId}.%(ext)s";
        $escapedTemp = escapeshellarg($tempTemplate);
        $videoUrl = escapeshellarg("https://www.youtube.com/watch?v={$videoId}");

        $ytDlp = \Sounify\CommandHelper::getYtDlp();
        $ffmpeg = \Sounify\CommandHelper::getFfmpeg();
        $ffmpegLocation = ($ffmpeg !== 'ffmpeg' && file_exists($ffmpeg)) ? '--ffmpeg-location ' . escapeshellarg(dirname($ffmpeg)) : '';
        $qualityArg = ($format === 'flac') ? '--audio-quality 0' : "--audio-quality {$bitrate}K";

        // yt-dlp audio download command
        $cmd = "{$ytDlp} --no-playlist {$ffmpegLocation} --extract-audio --audio-format {$format} {$qualityArg} "
             . "-o {$escapedTemp} {$videoUrl} 2>&1";

        $output = shell_exec($cmd);

        // Find downloaded file safely (immune to brackets in directory names)
        $downloadedTemp = null;
        $tempPrefix = "temp_{$jobId}.";
        if (is_dir($targetDir)) {
            foreach (scandir($targetDir) as $item) {
                if (str_starts_with($item, $tempPrefix)) {
                    $downloadedTemp = "{$targetDir}/{$item}";
                    break;
                }
            }
        }

        if (!$downloadedTemp || !file_exists($downloadedTemp)) {
            throw new \RuntimeException("Audio download failed. Output:\n" . substr((string) $output, -500));
        }

        if (file_exists($finalAudioPath)) {
            @unlink($finalAudioPath);
        }

        if (!@rename($downloadedTemp, $finalAudioPath)) {
            // Fallback for cross-device or permission lock
            copy($downloadedTemp, $finalAudioPath);
            @unlink($downloadedTemp);
        }

        // Clean any leftover temporary files for this job
        if (is_dir($targetDir)) {
            foreach (scandir($targetDir) as $item) {
                if (str_starts_with($item, $tempPrefix)) {
                    $leftover = "{$targetDir}/{$item}";
                    if ($leftover !== $finalAudioPath && file_exists($leftover)) {
                        @unlink($leftover);
                    }
                }
            }
        }

        $this->updateJob($jobId, 75.0, 'Fetching cover artwork...');

        // 4. Download cover artwork
        $tempCoverPath = null;
        if (!empty($song['cover_url'])) {
            $coverData = false;
            $ch = curl_init($song['cover_url']);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                CURLOPT_TIMEOUT => 15,
                CURLOPT_SSL_VERIFYPEER => false,
            ]);
            $resp = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode === 200 && !empty($resp)) {
                $coverData = $resp;
            } else {
                $coverData = @file_get_contents($song['cover_url']);
            }

            if ($coverData !== false && strlen($coverData) > 500) {
                $tempCoverPath = "{$targetDir}/temp_cover_{$jobId}.jpg";
                file_put_contents($tempCoverPath, $coverData);

                // Save a single cover image file alongside audio for Navidrome / media servers
                if (Config::getBool('save_cover_image', true)) {
                    $coverPath = $organizeByAlbum ? "{$targetDir}/cover.jpg" : "{$targetDir}/{$baseFilename}.jpg";
                    if (!file_exists($coverPath)) {
                        @file_put_contents($coverPath, $coverData);
                    }
                }
            }
        }

        // 5. Write ID3 tags and embedded cover artwork
        $this->updateJob($jobId, 85.0, 'Embedding ID3 metadata & cover art...');
        $this->tagger->tagAudio(
            $finalAudioPath,
            $song,
            $tempCoverPath
        );

        if ($tempCoverPath && file_exists($tempCoverPath)) {
            @unlink($tempCoverPath);
        }

        // 7. Save to history
        $this->saveHistory($song, $finalAudioPath, $format);

        // 8. Notify Navidrome if enabled
        if (Config::getBool('navidrome_enabled', false) && Config::getBool('navidrome_auto_scan', true)) {
            $this->updateJob($jobId, 95.0, 'Notifying Navidrome to scan library...');
            $navidrome = new NavidromeClient(
                Config::get('navidrome_url', 'http://127.0.0.1:4533'),
                Config::get('navidrome_user', ''),
                Config::get('navidrome_pass', '')
            );
            $navidrome->startScan();
        }

        $this->updateJob($jobId, 100.0, 'Download complete', 'done', $finalAudioPath);

        return $finalAudioPath;
    }

    private function sanitizeFilename(string $str): string
    {
        $cleaned = preg_replace('/[\\/:*?"<>|]/', '', $str);
        return trim(preg_replace('/\s+/', ' ', (string) $cleaned)) ?: 'Pista';
    }

    private function updateJob(string $id, float $progress, string $message, string $status = 'downloading', ?string $outputPath = null): void
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare("
            UPDATE jobs 
            SET progress = :p, message = :m, status = :s, output_path = :o, updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        ");
        $stmt->execute([
            ':p' => $progress,
            ':m' => $message,
            ':s' => $status,
            ':o' => $outputPath,
            ':id' => $id,
        ]);
    }

    private function saveHistory(array $song, string $filePath, string $format): void
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare("
            INSERT INTO history (spotify_id, title, artist, album, year, genre, duration, file_path, format)
            VALUES (:sid, :t, :a, :alb, :yr, :gnr, :d, :fp, :fmt)
        ");
        $stmt->execute([
            ':sid' => $song['id'] ?? null,
            ':t' => $song['title'] ?? '',
            ':a' => $song['artist'] ?? '',
            ':alb' => $song['album'] ?? '',
            ':yr' => $song['year'] ?? '',
            ':gnr' => $song['genre'] ?? '',
            ':d' => (int) ($song['duration'] ?? 0),
            ':fp' => $filePath,
            ':fmt' => $format,
        ]);
    }
}
