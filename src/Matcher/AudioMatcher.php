<?php
declare(strict_types=1);

namespace Sounify\Matcher;

class AudioMatcher
{
    private const NEGATIVE_KEYWORDS = [
        'karaoke', 'instrumental', 'cover', 'remix', 'live', 'ao vivo',
        'en vivo', 'acoustic', 'sped up', 'slowed', 'nightcore', '8d audio',
        'bass boosted', '1 hour', 'parody', 'tribute'
    ];

    public function findBestMatch(array $song): ?string
    {
        $artists = !empty($song['artists']) ? implode(' ', $song['artists']) : str_replace(';', ' ', (string)($song['artist'] ?? ''));
        $title = $song['title'] ?? $song['name'] ?? '';
        $targetDuration = (int) ($song['duration'] ?? 0);

        if (empty($title)) {
            return null;
        }

        // 1. Intento orden estándar: "<artistas> <titulo>"
        $query1 = trim("{$artists} {$title}");
        $candidates = $this->searchYoutube($query1, 8);
        $best = $this->pickBestCandidate($candidates, $song);

        if ($best !== null) {
            return $best['id'];
        }

        $allCandidates = $candidates;

        // 2. Intento orden inverso: "<titulo> <artistas>" (YouTube a veces rankea mejor así)
        $query2 = trim("{$title} {$artists}");
        if ($query2 !== $query1) {
            $candidatesAlt = $this->searchYoutube($query2, 8);
            $bestAlt = $this->pickBestCandidate($candidatesAlt, $song);
            if ($bestAlt !== null) {
                return $bestAlt['id'];
            }
            if (!empty($candidatesAlt)) {
                $allCandidates = array_merge($allCandidates, $candidatesAlt);
            }
        }

        // Fallback: si tenemos candidatos pero ninguno pasó el filtro estricto
        if (!empty($allCandidates)) {
            if ($targetDuration > 0) {
                $sorted = $allCandidates;
                usort($sorted, function ($a, $b) use ($targetDuration) {
                    $diffA = abs(($a['duration'] ?? 0) - $targetDuration);
                    $diffB = abs(($b['duration'] ?? 0) - $targetDuration);
                    return $diffA <=> $diffB;
                });
                if (abs(($sorted[0]['duration'] ?? 0) - $targetDuration) <= 25) {
                    return $sorted[0]['id'];
                }
            } else {
                return $allCandidates[0]['id'];
            }
        }

        return null;
    }

    private function searchYoutube(string $query, int $limit = 8): array
    {
        $ytDlp = \Sounify\CommandHelper::getYtDlp();
        $escapedQuery = escapeshellarg("ytsearch{$limit}:{$query}");
        $nullRedir = PHP_OS_FAMILY === 'Windows' ? '2>NUL' : '2>/dev/null';
        $cmd = "{$ytDlp} --flat-playlist --dump-json --no-warnings {$escapedQuery} {$nullRedir}";

        $output = shell_exec($cmd);
        if (!$output) {
            return [];
        }

        $results = [];
        $lines = explode("\n", trim($output));
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') continue;
            $data = json_decode($line, true);
            if (is_array($data) && !empty($data['id'])) {
                $results[] = [
                    'id' => $data['id'],
                    'title' => $data['title'] ?? '',
                    'uploader' => $data['uploader'] ?? '',
                    'duration' => (int) ($data['duration'] ?? 0),
                ];
            }
        }

        return $results;
    }

    private function pickBestCandidate(array $candidates, array $song): ?array
    {
        $targetTitle = mb_strtolower($song['title'] ?? '');
        $targetDuration = (int) ($song['duration'] ?? 0);
        $targetAlbum = mb_strtolower($song['album'] ?? '');

        $best = null;
        $bestScore = PHP_INT_MAX;

        foreach ($candidates as $c) {
            $cTitle = mb_strtolower($c['title'] ?? '');
            $cDuration = (int) ($c['duration'] ?? 0);

            // Filtro de palabras negativas si la canción original no las tiene
            foreach (self::NEGATIVE_KEYWORDS as $kw) {
                if (str_contains($cTitle, $kw) && !str_contains($targetTitle, $kw)) {
                    continue 2;
                }
            }

            // Filtro de duración: si difiere en más de 25 segundos, se descarta
            if ($targetDuration > 0 && $cDuration > 0) {
                $durationDiff = abs($cDuration - $targetDuration);
                if ($durationDiff > 25) {
                    continue;
                }
                $score = $durationDiff;
            } else {
                $score = 10;
            }

            // Bonus si el título núcleo coincide
            $cleanTarget = trim(explode('(', $targetTitle)[0]);
            $cleanTarget = trim(explode('-', $cleanTarget)[0]);
            if ($cleanTarget !== '' && str_contains($cTitle, $cleanTarget)) {
                $score -= 3;
            }

            // Bonus si el álbum coincide en el título o descripción
            if ($targetAlbum !== '' && str_contains($cTitle, $targetAlbum)) {
                $score -= 5;
            }

            if ($score < $bestScore) {
                $bestScore = $score;
                $best = $c;
            }
        }

        return $best;
    }
}
