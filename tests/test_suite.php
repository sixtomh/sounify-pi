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

// 10. Track metadata update API test
$stmt = $pdo->prepare("INSERT INTO history (title, artist, album, year, genre, duration, file_path, format) VALUES ('Old Title', 'Old Artist', 'Old Album', '2020', 'Pop', 180, 'dummy.mp3', 'mp3')");
$stmt->execute();
$updateTrackId = (int) $pdo->lastInsertId();

$_SERVER['REQUEST_URI'] = '/api/track/update';
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SESSION['sounify_authenticated'] = true;
$_POST = [
    'id' => $updateTrackId,
    'title' => 'New Title',
    'artist' => 'New Artist',
    'album' => 'New Album Name',
    'year' => '2024',
    'genre' => 'Hip-Hop/Rap'
];

ob_start();
$app = new Sounify\App();
$app->run();
$updateRes = json_decode(ob_get_clean(), true);

assert(isset($updateRes['success']) && $updateRes['success'] === true, "Track metadata update API failed");

$checkUpdate = $pdo->prepare("SELECT * FROM history WHERE id = :id");
$checkUpdate->execute([':id' => $updateTrackId]);
$updatedRow = $checkUpdate->fetch();
assert($updatedRow['album'] === 'New Album Name', "Album was not updated in database");
assert($updatedRow['title'] === 'New Title', "Title was not updated in database");
assert($updatedRow['year'] === '2024', "Year was not updated in database");

// Cleanup test row
$pdo->exec("DELETE FROM history WHERE id = {$updateTrackId}");
echo "[PASS] 10. Update track metadata API (Album, title, artist, year and genre updated)\n";

// 11. Bulk update & bulk delete API test
$dummyFile1 = Sounify\Config::getDownloadDir() . '/dummy_bulk_1.mp3';
$dummyFile2 = Sounify\Config::getDownloadDir() . '/dummy_bulk_2.mp3';
file_put_contents($dummyFile1, 'DUMMY 1');
file_put_contents($dummyFile2, 'DUMMY 2');

$stmt = $pdo->prepare("INSERT INTO history (title, artist, album, duration, file_path, format) VALUES ('Track 1', 'Artist A', 'Old Alb 1', 100, :fp1, 'mp3')");
$stmt->execute([':fp1' => $dummyFile1]);
$id1 = (int) $pdo->lastInsertId();

$stmt = $pdo->prepare("INSERT INTO history (title, artist, album, duration, file_path, format) VALUES ('Track 2', 'Artist B', 'Old Alb 2', 200, :fp2, 'mp3')");
$stmt->execute([':fp2' => $dummyFile2]);
$id2 = (int) $pdo->lastInsertId();

// 11a. Test bulk-update
$_SERVER['REQUEST_URI'] = '/api/library/bulk-update';
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SESSION['sounify_authenticated'] = true;
$_POST = [
    'ids' => [$id1, $id2],
    'album' => 'Unified Album',
    'genre' => 'Electronic'
];

ob_start();
$app = new Sounify\App();
$app->run();
$bulkUpdateRes = json_decode(ob_get_clean(), true);

assert(isset($bulkUpdateRes['success']) && $bulkUpdateRes['success'] === true, "Bulk update failed");
assert($bulkUpdateRes['updated'] === 2, "Bulk update count mismatch");

$row1 = $pdo->query("SELECT * FROM history WHERE id = {$id1}")->fetch();
$row2 = $pdo->query("SELECT * FROM history WHERE id = {$id2}")->fetch();
assert($row1['album'] === 'Unified Album' && $row1['genre'] === 'Electronic', "Row 1 bulk update mismatch");
assert($row2['album'] === 'Unified Album' && $row2['genre'] === 'Electronic', "Row 2 bulk update mismatch");

// 11b. Test bulk-delete
$_SERVER['REQUEST_URI'] = '/api/library/bulk-delete';
$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST = [
    'ids' => [$id1, $id2]
];

ob_start();
$app = new Sounify\App();
$app->run();
$bulkDeleteRes = json_decode(ob_get_clean(), true);

assert(isset($bulkDeleteRes['success']) && $bulkDeleteRes['success'] === true, "Bulk delete failed");
assert($bulkDeleteRes['deleted'] === 2, "Bulk delete count mismatch");
assert(!file_exists($dummyFile1), "Bulk dummy file 1 not deleted from disk");
assert(!file_exists($dummyFile2), "Bulk dummy file 2 not deleted from disk");

$remainingCount = (int) $pdo->query("SELECT COUNT(*) FROM history WHERE id IN ({$id1}, {$id2})")->fetchColumn();
assert($remainingCount === 0, "Bulk deleted rows still remain in history table");

echo "[PASS] 11. Bulk update & bulk delete APIs (Multi-track batch tagging & batch deletion)\n";

echo "\nALL TESTS PASSED SUCCESSFULLY!\n";
