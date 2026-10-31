<?php
declare(strict_types=1);

namespace Sounify\Scraper;

class SpotifyScraper
{
    private const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    public function parseUrl(string $url): ?array
    {
        $url = trim($url);
        if (str_starts_with($url, 'spotify:')) {
            $parts = explode(':', $url);
            if (count($parts) >= 3) {
                return ['type' => $parts[1], 'id' => $parts[2]];
            }
        }

        // Expand short spotify.link URLs
        if (preg_match('#https?://spotify\.link/[A-Za-z0-9]+#i', $url)) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_NOBODY => true,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_USERAGENT => self::USER_AGENT,
            ]);
            curl_exec($ch);
            $effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
            curl_close($ch);
            if ($effectiveUrl) {
                $url = $effectiveUrl;
            }
        }

        if (preg_match('#(?:open\.)?spotify\.com/(?:intl-[a-zA-Z0-9_-]+/)?(track|album|playlist|artist)/([A-Za-z0-9]+)#i', $url, $m)) {
            return ['type' => strtolower($m[1]), 'id' => $m[2]];
        }

        return null;
    }

    public function resolve(string $url): array
    {
        $parsed = $this->parseUrl($url);
        if (!$parsed) {
            throw new \InvalidArgumentException("URL de Spotify no válida: {$url}");
        }

        return $this->fetchEmbedEntity($parsed['type'], $parsed['id']);
    }

    public function fetchEmbedEntity(string $kind, string $id): array
    {
        $url = "https://open.spotify.com/embed/{$kind}/{$id}";
        $html = $this->httpGet($url);

        $payload = null;
        if (preg_match('#<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>#s', $html, $matches)) {
            $payload = json_decode($matches[1], true);
        } elseif (preg_match('#<script[^>]*id="initial-state"[^>]*>(.*?)</script>#s', $html, $matches)) {
            $raw = base64_decode($matches[1]) ?: $matches[1];
            $payload = json_decode($raw, true);
        }

        if (!is_array($payload)) {
            throw new \RuntimeException("No se pudieron extraer los metadatos de Spotify para {$kind}/{$id}.");
        }

        $pageProps = $payload['props']['pageProps'] ?? [];
        $entity = $pageProps['state']['data']['entity']
               ?? $pageProps['entity']
               ?? $pageProps['data']['entity']
               ?? null;

        if (!is_array($entity)) {
            if (($pageProps['status'] ?? null) === 404) {
                throw new \RuntimeException("El enlace o ID de Spotify ({$kind}/{$id}) no existe o no se encuentra público.");
            }
            throw new \RuntimeException("No se encontró la entidad musical en los datos de Spotify.");
        }

        return $this->normalizeEntity($kind, $id, $entity, $payload);
    }

    private function normalizeEntity(string $kind, string $id, array $entity, array $rawPayload): array
    {
        $name = $entity['title'] ?? $entity['name'] ?? 'Desconocido';
        $coverUrl = $this->extractCoverUrl($entity);

        if ($kind === 'track') {
            $artists = $this->extractArtists($entity);
            $durationMs = $entity['duration'] ?? 0;
            $durationSec = (int) round($durationMs / 1000);
            $releaseDate = $this->extractReleaseDate($entity);

            $rawAlbum = trim($entity['album']['name'] ?? '');
            $albumName = ($rawAlbum !== '' && strtolower($rawAlbum) !== 'single') ? $rawAlbum : $name;

            return [
                'type' => 'track',
                'id' => $id,
                'name' => $name,
                'title' => $name,
                'artists' => $artists,
                'artist' => implode('; ', $artists),
                'album' => $albumName,
                'album_name' => $albumName,
                'duration' => $durationSec,
                'cover_url' => $coverUrl,
                'release_date' => $releaseDate,
                'year' => substr($releaseDate, 0, 4),
                'genre' => '',
                'explicit' => ($entity['contentRating']['label'] ?? '') === 'EXPLICIT',
                'url' => "https://open.spotify.com/track/{$id}",
            ];
        }

        // Para álbumes o playlists
        $tracks = [];
        $rawTracks = $entity['trackList'] ?? $entity['tracks']['items'] ?? [];
        $albumReleaseDate = $this->extractReleaseDate($entity);
        $albumYear = !empty($albumReleaseDate) ? substr($albumReleaseDate, 0, 4) : '';

        foreach ($rawTracks as $idx => $t) {
            $item = $t['track'] ?? $t;
            $tTitle = $item['title'] ?? $item['name'] ?? '';
            $tArtists = $this->extractArtists($item);

            // En listas de reproducción, a veces los artistas están en subtitle
            if (empty($tArtists) && !empty($t['subtitle'])) {
                $sub = str_replace("\xc2\xa0", ' ', (string) $t['subtitle']);
                $tArtists = array_filter(array_map('trim', preg_split('/[,，]/', $sub)));
            }

            $tDuration = (int) round(($item['duration'] ?? 0) / 1000);
            $tId = $item['id'] ?? '';
            $tCover = $this->extractCoverUrl($item) ?: $coverUrl;
            $itemRelDate = $this->extractReleaseDate($item) ?: $albumReleaseDate;
            $itemYear = !empty($itemRelDate) ? substr($itemRelDate, 0, 4) : $albumYear;

            $rawTAlbum = trim($kind === 'album' ? $name : ($item['album']['name'] ?? ''));
            $tAlbum = ($rawTAlbum !== '' && strtolower($rawTAlbum) !== 'single') ? $rawTAlbum : $tTitle;

            $tracks[] = [
                'type' => 'track',
                'id' => $tId,
                'order' => $idx + 1,
                'name' => $tTitle,
                'title' => $tTitle,
                'artists' => $tArtists,
                'artist' => implode('; ', $tArtists),
                'album' => $tAlbum,
                'album_name' => $tAlbum,
                'release_date' => $itemRelDate,
                'year' => $itemYear,
                'genre' => $item['genre'] ?? ($entity['genre'] ?? ''),
                'duration' => $tDuration,
                'cover_url' => $tCover,
                'url' => $tId ? "https://open.spotify.com/track/{$tId}" : '',
                'explicit' => ($item['contentRating']['label'] ?? '') === 'EXPLICIT',
            ];
        }

        return [
            'type' => $kind,
            'id' => $id,
            'name' => $name,
            'title' => $name,
            'cover_url' => $coverUrl,
            'track_count' => count($tracks),
            'tracks' => $tracks,
        ];
    }

    private function extractArtists(array $entity): array
    {
        $artists = [];
        foreach ($entity['artists'] ?? [] as $a) {
            if (is_string($a) && trim($a) !== '') {
                $artists[] = trim($a);
            } elseif (is_array($a) && !empty($a['name'])) {
                $artists[] = trim($a['name']);
            }
        }
        return array_values(array_unique($artists));
    }

    private function extractCoverUrl(array $entity): string
    {
        $sources = $entity['coverArt']['sources']
                ?? $entity['visualIdentity']['image']
                ?? $entity['album']['coverArt']['sources']
                ?? $entity['album']['images']
                ?? [];

        if (!is_array($sources) || empty($sources)) {
            return '';
        }

        usort($sources, function ($a, $b) {
            $wA = (int) ($a['width'] ?? $a['maxWidth'] ?? 0);
            $wB = (int) ($b['width'] ?? $b['maxWidth'] ?? 0);
            return $wB <=> $wA;
        });

        return $sources[0]['url'] ?? '';
    }

    private function extractReleaseDate(array $entity): string
    {
        $rd = $entity['releaseDate'] ?? null;
        if (is_array($rd)) {
            return (string) ($rd['isoString'] ?? '');
        }
        if (is_string($rd)) {
            return $rd;
        }
        return '';
    }

    private function httpGet(string $url): string
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT => self::USER_AGENT,
            CURLOPT_HTTPHEADER => [
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language: en-US,en;q=0.9,es;q=0.8',
            ],
            CURLOPT_TIMEOUT => 20,
            CURLOPT_SSL_VERIFYPEER => false,
        ]);

        $res = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($res === false || $status < 200 || $status >= 400) {
            throw new \RuntimeException("Petición HTTP fallida a {$url} (código {$status}): {$err}");
        }

        return (string) $res;
    }
}
