<?php
declare(strict_types=1);

namespace Sounify\Metadata;

class MetadataEnricher
{
    /**
     * Completa el año, género musical, álbum y número de pista usando iTunes Search API o heurísticas.
     */
    public function enrich(array $song): array
    {
        $year = $song['year'] ?? '';
        $genre = $song['genre'] ?? '';
        $title = trim($song['title'] ?? $song['name'] ?? '');
        $currentAlbum = trim($song['album'] ?? $song['album_name'] ?? '');
        $order = $song['order'] ?? $song['track_number'] ?? null;

        // Si el álbum está vacío o es 'single', necesita enriquecimiento de álbum
        $needsAlbum = ($currentAlbum === '' || strtolower($currentAlbum) === 'single');
        $needsYear = empty($year);
        $needsGenre = empty($genre);
        $needsOrder = empty($order);

        // Si ya tiene todo (año, género y álbum auténtico), no hace falta consultar
        if (!$needsYear && !$needsGenre && !$needsAlbum) {
            return $song;
        }

        $artist = !empty($song['artists'][0]) ? $song['artists'][0] : ($song['artist'] ?? '');
        // Limpiar colaboraciones para la búsqueda (ej: "Lyry; IvanConly..." -> "Lyry")
        $primaryArtist = trim(explode(';', (string)$artist)[0]);
        $primaryArtist = trim(explode(',', $primaryArtist)[0]);

        if (!empty($title)) {
            $meta = $this->queryItunes($title, $primaryArtist);
            if (!empty($meta['genre']) && empty($genre)) {
                $song['genre'] = $meta['genre'];
            }
            if (!empty($meta['year']) && empty($year)) {
                $song['year'] = $meta['year'];
                if (empty($song['release_date'])) {
                    $song['release_date'] = $meta['release_date'] ?? $meta['year'];
                }
            }
            if (!empty($meta['album']) && $needsAlbum) {
                $song['album'] = $meta['album'];
                $song['album_name'] = $meta['album'];
            }
            if (!empty($meta['track_number']) && $needsOrder) {
                $song['order'] = (int) $meta['track_number'];
            }
        }

        $album = trim($song['album'] ?? $song['album_name'] ?? '');
        if ($album === '' || strtolower($album) === 'single') {
            $song['album'] = $title;
            $song['album_name'] = $title;
        }

        // Si el año aún está vacío pero tenemos release_date
        if (empty($song['year']) && !empty($song['release_date'])) {
            $song['year'] = substr((string)$song['release_date'], 0, 4);
        }

        return $song;
    }

    private function queryItunes(string $title, string $artist): array
    {
        $term = urlencode(trim("{$artist} {$title}"));
        $url = "https://itunes.apple.com/search?term={$term}&entity=song&limit=1";

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
            CURLOPT_TIMEOUT => 4,
            CURLOPT_SSL_VERIFYPEER => false,
        ]);

        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code === 200 && $res) {
            $data = json_decode($res, true);
            if (!empty($data['results'][0])) {
                $item = $data['results'][0];
                $releaseDate = $item['releaseDate'] ?? '';
                $year = $releaseDate ? substr($releaseDate, 0, 4) : '';
                return [
                    'album' => $item['collectionName'] ?? null,
                    'track_number' => $item['trackNumber'] ?? null,
                    'track_count' => $item['trackCount'] ?? null,
                    'genre' => $item['primaryGenreName'] ?? null,
                    'year' => $year ?: null,
                    'release_date' => $releaseDate ?: null,
                ];
            }
        }

        return [];
    }
}
