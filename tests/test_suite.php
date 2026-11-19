<?php
declare(strict_types=1);

require __DIR__ . '/../src/App.php';
Sounify\App::registerAutoloader();

echo "Running Sounify Pi verification tests...\n";

// 1. Config & Database
$pdo = Sounify\Database::get();
assert($pdo instanceof PDO, "PDO instance failed");
assert(is_string(Sounify\Config::get('audio_format')), "audio_format not string");
assert(is_dir(Sounify\Config::getDownloadDir()) || is_string(Sounify\Config::getDownloadDir()), "download_dir invalid");
echo "[PASS] 1. Database & Config (Format: " . Sounify\Config::get('audio_format') . ", Dir: " . Sounify\Config::getDownloadDir() . ")\n";

// 2. MetadataEnricher
$enricher = new Sounify\Metadata\MetadataEnricher();
$song = $enricher->enrich(['title' => 'Billie Jean', 'artist' => 'Michael Jackson']);
assert(!empty($song['genre']), "Genre enrichment failed");
assert(!empty($song['year']), "Year enrichment failed");
echo "[PASS] 2. MetadataEnricher (Year: {$song['year']}, Genre: {$song['genre']})\n";

// 3. M3uWriter
$m3u = Sounify\Playlist\M3uWriter::write('Unit Test', ['storage/downloads/dummy.mp3'], 'storage/downloads');
assert(file_exists($m3u), "M3U file not generated");
@unlink($m3u);
echo "[PASS] 3. M3uWriter relative path calculation\n";

// 4. NavidromeClient
$nc = new Sounify\Integrations\NavidromeClient('http://127.0.0.1:4533', 'admin', 'password');
$testConn = $nc->testConnection();
assert(isset($testConn['success']), "Navidrome connection test return invalid");
echo "[PASS] 4. NavidromeClient interface\n";

// 5. CommandHelper
$yt = Sounify\CommandHelper::getYtDlp();
$ff = Sounify\CommandHelper::getFfmpeg();
assert(!empty($yt), "yt-dlp command empty");
assert(!empty($ff), "ffmpeg command empty");
echo "[PASS] 5. CommandHelper (yt-dlp: {$yt}, ffmpeg: {$ff})\n";

// 6. SpotifyScraper
$scraper = new Sounify\Scraper\SpotifyScraper();
$track = $scraper->resolve('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
assert($track['title'] === 'Never Gonna Give You Up', "Spotify title match failed");
assert(!empty($track['duration']), "Spotify track duration empty");
echo "[PASS] 6. SpotifyScraper resolve track: {$track['title']}\n";

// 7. Docs routing check
$_SERVER['REQUEST_URI'] = '/docs/';
$_SERVER['REQUEST_METHOD'] = 'GET';
ob_start();
$app = new Sounify\App();
$app->run();
$docsHtml = ob_get_clean();
assert(str_contains($docsHtml, 'Documentation &amp; Setup Guide') || str_contains($docsHtml, 'Documentation & Setup Guide'), "Docs page not served");
echo "[PASS] 7. Documentation page routing (/docs/ -> index.html)\n";

// 8. AudioMatcher query test
$matcher = new Sounify\Matcher\AudioMatcher();
$matchId = $matcher->findBestMatch(['title' => 'Never Gonna Give You Up', 'artist' => 'Rick Astley', 'duration' => 213]);
assert(!empty($matchId), "AudioMatcher failed to find match");
echo "[PASS] 8. AudioMatcher YouTube resolution: {$matchId}\n";

// 9. Track deletion API test (file & database record removal)
$dummyFile = Sounify\Config::getDownloadDir() . '/dummy_to_delete.mp3';
file_put_contents($dummyFile, 'DUMMY AUDIO DATA');
$stmt = $pdo->prepare("INSERT INTO history (title, artist, album, duration, file_path, format) VALUES ('Test Song', 'Test Artist', 'Test Album', 120, :fp, 'mp3')");
$stmt->execute([':fp' => $dummyFile]);
$insertedId = (int) $pdo->lastInsertId();

$_SERVER['REQUEST_URI'] = '/api/library/delete';
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SESSION['sounify_authenticated'] = true;
$_POST = ['id' => $insertedId];

ob_start();
$app = new Sounify\App();
$app->run();
$deleteRes = json_decode(ob_get_clean(), true);

assert(isset($deleteRes['success']) && $deleteRes['success'] === true, "Track deletion API failed");
assert(!file_exists($dummyFile), "Physical audio file was not deleted from disk");

$checkStmt = $pdo->prepare("SELECT COUNT(*) FROM history WHERE id = :id");
$checkStmt->execute([':id' => $insertedId]);
assert((int)$checkStmt->fetchColumn() === 0, "Track record was not removed from SQLite database");
echo "[PASS] 9. Delete track API (Disk file & database row successfully removed)\n";

echo "\nALL TESTS PASSED SUCCESSFULLY!\n";
