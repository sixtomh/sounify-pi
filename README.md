# 🎵 Sounify Pi — Orange Pi & Navidrome Edition

Self-hosted music downloader built in **PHP 8.2+**, optimized specifically for **Orange Pi** boards (ARM64 / `aarch64`) and natively integrated with your **Navidrome** server.

---

## 🌟 Key Features

* **No Spotify API Keys or Premium Accounts Required:** Extracts metadata directly from public embed pages (`open.spotify.com/embed`) by parsing client state (`__NEXT_DATA__`).
* **Intelligent Audio Matcher:** Identifies the cleanest audio stream on YouTube Music / YouTube, rejecting unwanted remixes, live recordings, and karaoke versions by evaluating duration deltas and album bonuses.
* **Download & Transcoding with yt-dlp + ffmpeg:** Supports MP3 (up to 320 kbps), FLAC (lossless), M4A/AAC, and OPUS with embedded ID3v2 tags (Title, Artist, Album, Year, Genre, Track number) and cover art.
* **Metadata Enrichment (Year & Genre):** Automatically detects and embeds release year and musical genre using Spotify public release dates and iTunes Metadata API without requiring any developer accounts.
* **Cover Artwork Files:** Automatically downloads and preserves `cover.jpg`, `folder.jpg`, and track cover images alongside the audio files for instant Navidrome and file explorer album art detection.
* **Media Server Folder Hierarchy:** Organizes music automatically into `Artist/Album/Track.ext` with standard `.m3u` playlists in `Playlists/`.
* **Automatic Navidrome Sync:** Automatically triggers library rescanning via Navidrome's Subsonic API (`startScan.view`) as soon as each track finishes.
* **LAN & Wi-Fi Access Control:** Dedicated `login.php` authentication layer connected to `sounify.db` to prevent unauthorized users on your local network or Wi-Fi from modifying downloads or viewing your library. Default credentials: `admin` / `admin`.
* **Ultra-low resource footprint:** Built with lightweight PHP and SQLite, consuming under 60 MB of RAM, perfect for Orange Pi single-board computers.

---

## 📂 Recommended Directory Structure on Orange Pi

To allow Navidrome to index your music instantaneously, both services share the same storage folder:

```text
/mnt/storage/music/                  <-- Your music directory on Orange Pi
├── Queen/
│   └── A Night at the Opera/
│       └── 01. Queen - Bohemian Rhapsody.mp3
├── Daft Punk/
│   └── Discovery/
│       └── 01. Daft Punk - One More Time.mp3
└── Playlists/
    └── Favorites.m3u                         <-- Navidrome playlist
```

---

## 🚀 Installation on Orange Pi

Choose between **Docker Compose** or **Native Installation (bare-metal with systemd)**:

---

### Option 1: Docker Compose (Recommended)

1. **Clone the repository on your Orange Pi:**
   ```bash
   git clone https://github.com/sixtomh/sounify-pi.git /opt/sounify-pi
   cd /opt/sounify-pi
   ```

2. **Configure `docker-compose.yml`:**
   Verify the host music volume matches your storage path on the Orange Pi (e.g. `/mnt/storage/music`):
   ```yaml
   volumes:
     - /mnt/storage/music:/app/storage/downloads:rw
     - ./data/sounify:/app/storage
   ```

3. **Start the containers:**
   ```bash
   docker compose up -d --build
   ```

4. **Access the web interface:**
   Open in your browser:
   `http://IP_OF_YOUR_ORANGE_PI:8080`

---

### Option 2: Native Bare-Metal Installation (systemd)

#### 1. Install system dependencies on Orange Pi:
```bash
sudo apt update
sudo apt install -y php-cli php-curl php-mbstring php-sqlite3 ffmpeg python3-pip curl git
```

#### 2. Install latest `yt-dlp`:
```bash
sudo pip3 install --break-system-packages yt-dlp
# Or download the ARM64 standalone binary:
# sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
# sudo chmod a+rx /usr/local/bin/yt-dlp
```

#### 3. Clone Sounify Pi to `/opt/sounify-pi`:
```bash
sudo git clone https://github.com/sixtomh/sounify-pi.git /opt/sounify-pi
cd /opt/sounify-pi
sudo mkdir -p storage/downloads
sudo chmod -R 777 storage
```

#### 4. Configure `systemd` service for auto-start:
```bash
sudo cp systemd/sounify-pi.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sounify-pi
```

Check status:
```bash
sudo systemctl status sounify-pi
```

Open in your browser: `http://IP_OF_YOUR_ORANGE_PI:8080`

---

## ⚙️ Configuration & Navidrome Integration

1. In Sounify Pi, go to the **Settings** tab.
2. **Music Directory:** Set your local music storage path (e.g., `/mnt/storage/music`).
3. **File Organization:** Check `Organize in folders by Artist`, and `Organize in subfolders by Album`.
4. **Navidrome Connection:**
   * Check **Enable Navidrome Server Connection**.
   * **Server URL:** `http://127.0.0.1:4533` (or your local IP).
   * **Username & Password:** Your Navidrome admin credentials.
   * Check **Automatically rescan Navidrome library after each download**.
   * Click **Test Connection** to verify Subsonic ping.
   * Click **Save Settings**.

---

## 🎧 Navigation & Usage

* **Home:** Quick stats (total library tracks, active downloads, format quality, sync status) and recent additions shelf.
* **Search:** Paste any Spotify track, album, or playlist link to resolve metadata and trigger downloads.
* **Downloads:** Real-time progress bars showing download, audio conversion, ID3 tagging, and cover art embedding.
* **Library:** Browse all downloaded music with instant real-time filtering by artist, title, or album.
* **Settings:** Manage storage folders, formats, bitrates, and Navidrome credentials.

---

## 📄 License
MIT License
