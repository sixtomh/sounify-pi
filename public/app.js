// Sounify Pi Client Application (English Edition)
document.addEventListener('DOMContentLoaded', () => {
  // Theme Switcher (Dark & Light)
  const themeToggleBtn = document.getElementById('theme-toggle');
  const iconSun = document.getElementById('icon-sun');
  const iconMoon = document.getElementById('icon-moon');

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sounify-theme', theme);
    if (theme === 'light') {
      if (iconSun) iconSun.style.display = 'none';
      if (iconMoon) iconMoon.style.display = 'inline-block';
    } else {
      if (iconSun) iconSun.style.display = 'inline-block';
      if (iconMoon) iconMoon.style.display = 'none';
    }
  }

  const savedTheme = localStorage.getItem('sounify-theme') || 
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(savedTheme);

  themeToggleBtn?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  const queueBadge = document.getElementById('queue-badge');

  // Navigation Tabs (Ordered: Home, Search, Downloads, Library, History, Settings)
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');

  function switchTab(tabId) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    panels.forEach(p => p.classList.toggle('active', p.id === `panel-${tabId}`));

    if (tabId === 'home') {
      loadHomeStats();
    } else if (tabId === 'downloads') {
      loadJobs();
    } else if (tabId === 'library') {
      loadLibrary();
    } else if (tabId === 'settings') {
      loadSettings();
    } else if (tabId === 'search') {
      document.getElementById('spotify-url-input')?.focus();
    }
  }

  tabs.forEach(tab => {
    if (tab.dataset.tab) {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    }
  });

  // Check URL query parameters for tab routing (e.g., /?tab=library)
  const urlParams = new URLSearchParams(window.location.search);
  const targetTab = urlParams.get('tab');
  if (targetTab && ['home', 'search', 'downloads', 'library', 'settings'].includes(targetTab)) {
    switchTab(targetTab);
  }

  // Home Quick Action Buttons
  document.getElementById('btn-home-go-search')?.addEventListener('click', () => switchTab('search'));
  document.getElementById('btn-home-view-all')?.addEventListener('click', () => switchTab('library'));
  document.getElementById('btn-home-scan-navidrome')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-home-scan-navidrome');
    btn.disabled = true;
    btn.textContent = 'Syncing...';
    try {
      const res = await fetch('/api/navidrome/scan', { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'Navidrome scan triggered.');
    } catch {
      alert('Failed to contact Navidrome.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sync Navidrome Now';
    }
  });

  // Load Home Stats & Recents
  async function loadHomeStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      const stats = data.stats || {};

      document.getElementById('home-stat-total').textContent = stats.total_tracks ?? 0;
      document.getElementById('home-stat-active').textContent = stats.active_jobs ?? 0;
      document.getElementById('home-stat-format').textContent = (stats.audio_format || 'MP3').toUpperCase();
      
      const navStatusEl = document.getElementById('home-stat-navidrome');
      if (stats.navidrome_enabled) {
        navStatusEl.textContent = 'Active';
        navStatusEl.style.color = 'var(--accent-primary)';
      } else {
        navStatusEl.textContent = 'Disabled';
        navStatusEl.style.color = 'var(--text-muted)';
      }

      // Recent shelf
      const grid = document.getElementById('home-recent-grid');
      const recents = stats.recent_tracks || [];

      if (recents.length === 0) {
        grid.innerHTML = '<div class="empty-state">No downloads yet. Go to Search to add your first track!</div>';
        return;
      }

      grid.innerHTML = recents.map(r => `
        <div class="recent-track-card">
          <div class="recent-track-title">${escapeHtml(r.title)}</div>
          <div class="recent-track-artist">${escapeHtml(r.artist)}</div>
          <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.35rem;">
            ${(r.format || 'mp3').toUpperCase()} · ${formatDuration(r.duration)}
          </div>
        </div>
      `).join('');
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  }

  // Paste from clipboard button
  const pasteBtn = document.getElementById('paste-btn');
  const urlInput = document.getElementById('spotify-url-input');

  pasteBtn?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        urlInput.focus();
      }
    } catch {
      urlInput.focus();
    }
  });

  // Resolve Spotify URL
  const resolveForm = document.getElementById('resolve-form');
  const resolveBtn = document.getElementById('resolve-btn');
  const resolveError = document.getElementById('resolve-error');
  const previewContainer = document.getElementById('preview-container');

  let resolvedData = null;

  resolveForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    resolveError.style.display = 'none';
    previewContainer.style.display = 'none';
    setLoading(resolveBtn, true);

    try {
      const res = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.message || json.error || 'Failed to resolve Spotify URL');
      }

      resolvedData = json.data;
      renderPreview(resolvedData);
    } catch (err) {
      resolveError.textContent = err.message;
      resolveError.style.display = 'block';
    } finally {
      setLoading(resolveBtn, false);
    }
  });

  function renderPreview(data) {
    previewContainer.innerHTML = '';

    if (data.type === 'track') {
      previewContainer.innerHTML = `
        <div class="glass-panel preview-card">
          <img src="${data.cover_url || ''}" alt="Cover" class="preview-cover" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'140\' height=\'140\' fill=\'%23222\'><rect width=\'140\' height=\'140\'/></svg>'">
          <div class="preview-meta">
            <span class="preview-tag">Single Track</span>
            <h3 class="preview-title">${escapeHtml(data.title)}</h3>
            <p class="preview-artist">${escapeHtml(data.artist)}</p>
            <div class="preview-details">
              <span>Album: <strong>${escapeHtml(data.album || 'Single')}</strong></span>
              <span>Duration: <strong>${formatDuration(data.duration)}</strong></span>
              ${data.year ? `<span>Year: <strong>${escapeHtml(data.year)}</strong></span>` : ''}
              ${data.genre ? `<span>Genre: <strong>${escapeHtml(data.genre)}</strong></span>` : ''}
            </div>
          </div>
          <div>
            <button class="btn-primary btn-lg" id="btn-download-single">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download Track
            </button>
          </div>
        </div>
      `;

      document.getElementById('btn-download-single').addEventListener('click', () => {
        queueDownload(data);
      });
    } else {
      // Album or Playlist
      const isAlbum = data.type === 'album';
      let tracksHtml = data.tracks.map((t, idx) => `
        <div class="track-item" data-id="${t.id}">
          <div class="track-left">
            <span class="track-num">${idx + 1}</span>
            <img src="${t.cover_url || data.cover_url || ''}" alt="Cover" class="track-thumb" onerror="this.style.display='none'">
            <div>
              <div class="track-name">${escapeHtml(t.title)}</div>
              <div class="track-sub">${escapeHtml(t.artist)}${t.genre ? ` · ${escapeHtml(t.genre)}` : ''}${t.year ? ` · ${escapeHtml(t.year)}` : ''}</div>
            </div>
          </div>
          <div class="track-right">
            <button class="btn-secondary btn-sm btn-download-track" data-index="${idx}">
              Download
            </button>
          </div>
        </div>
      `).join('');

      previewContainer.innerHTML = `
        <div class="glass-panel preview-card">
          <img src="${data.cover_url || ''}" alt="Cover" class="preview-cover" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'140\' height=\'140\' fill=\'%23222\'><rect width=\'140\' height=\'140\'/></svg>'">
          <div class="preview-meta">
            <span class="preview-tag">${isAlbum ? 'Album' : 'Playlist'}</span>
            <h3 class="preview-title">${escapeHtml(data.name || data.title)}</h3>
            <div class="preview-details">
              <span>${data.track_count} tracks</span>
              ${data.year ? `<span>Year: <strong>${escapeHtml(data.year)}</strong></span>` : ''}
              ${data.genre ? `<span>Genre: <strong>${escapeHtml(data.genre)}</strong></span>` : ''}
            </div>
          </div>
          <div>
            <button class="btn-primary btn-lg" id="btn-download-all">
              Download All (${data.track_count})
            </button>
          </div>
        </div>

        <div class="glass-panel tracklist-card">
          <div class="tracklist-container">
            ${tracksHtml}
          </div>
        </div>
      `;

      document.getElementById('btn-download-all').addEventListener('click', () => {
        const playlistContext = {
          name: data.name || data.title || 'Playlist',
          totalTracks: data.tracks.length,
          processedCount: 0,
          downloadedPaths: []
        };
        data.tracks.forEach(track => queueDownload(track, playlistContext));
        switchTab('downloads');
      });

      previewContainer.querySelectorAll('.btn-download-track').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.index, 10);
          queueDownload(data.tracks[idx]);
          btn.textContent = 'Queued';
          btn.disabled = true;
        });
      });
    }

    previewContainer.style.display = 'block';
  }

  // Client-side Download Queue Manager
  const downloadQueue = [];
  let isQueueProcessing = false;

  function queueDownload(track, playlistContext = null) {
    downloadQueue.push({ track, playlistContext });
    updateQueueBadge();
    processDownloadQueue();
  }

  async function processDownloadQueue() {
    if (isQueueProcessing || downloadQueue.length === 0) {
      return;
    }
    isQueueProcessing = true;

    while (downloadQueue.length > 0) {
      const item = downloadQueue.shift();
      updateQueueBadge();
      try {
        const res = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ track: item.track })
        });
        const json = await res.json();
        if (item.playlistContext) {
          item.playlistContext.processedCount = (item.playlistContext.processedCount || 0) + 1;
          if (json.output_path) {
            item.playlistContext.downloadedPaths.push(json.output_path);
          }
          if (item.playlistContext.processedCount === item.playlistContext.totalTracks && item.playlistContext.downloadedPaths.length > 0) {
            triggerM3uGeneration(item.playlistContext);
          }
        }
      } catch (e) {
        if (item.playlistContext) {
          item.playlistContext.processedCount = (item.playlistContext.processedCount || 0) + 1;
          if (item.playlistContext.processedCount === item.playlistContext.totalTracks && item.playlistContext.downloadedPaths.length > 0) {
            triggerM3uGeneration(item.playlistContext);
          }
        }
      }
      loadJobs();
    }

    isQueueProcessing = false;
    updateQueueBadge();
  }

  async function triggerM3uGeneration(context) {
    try {
      await fetch('/api/playlist/create-m3u', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: context.name,
          files: context.downloadedPaths
        })
      });
    } catch (e) {}
  }

  function updateQueueBadge() {
    const totalPending = downloadQueue.length;
    if (queueBadge) {
      if (totalPending > 0) {
        queueBadge.textContent = totalPending;
        queueBadge.style.display = 'inline-block';
      } else {
        queueBadge.style.display = 'none';
      }
    }
  }

  // Active Downloads & Jobs Polling
  const jobsList = document.getElementById('jobs-list');
  const clearJobsBtn = document.getElementById('clear-jobs-btn');

  clearJobsBtn?.addEventListener('click', async () => {
    await fetch('/api/clear-completed', { method: 'POST' });
    loadJobs();
  });

  let isFetchingJobs = false;

  async function loadJobs() {
    if (isFetchingJobs) return;
    isFetchingJobs = true;
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      const jobs = data.jobs || [];

      const activeCount = jobs.filter(j => j.status === 'downloading' || j.status === 'pending').length;
      if (queueBadge) {
        if (activeCount > 0) {
          queueBadge.textContent = activeCount;
          queueBadge.style.display = 'inline-block';
        } else if (downloadQueue.length === 0) {
          queueBadge.style.display = 'none';
        }
      }

      if (jobs.length === 0) {
        jobsList.innerHTML = '<div class="empty-state">No active downloads right now.</div>';
        return;
      }

      jobsList.innerHTML = jobs.map(j => {
        const isDone = j.status === 'done';
        const isError = j.status === 'error';
        const statusColor = isDone ? 'var(--success)' : (isError ? 'var(--error)' : 'var(--accent-primary)');

        return `
          <div class="job-item">
            <div class="job-header">
              <div>
                <div class="job-song-title">${escapeHtml(j.title)}</div>
                <div class="job-song-artist">${escapeHtml(j.artist)} · ${escapeHtml(j.album || '')}</div>
              </div>
              <span style="font-size: 0.8rem; font-weight: 700; color: ${statusColor}">
                ${isDone ? 'Completed' : (isError ? 'Error' : Math.round(j.progress) + '%')}
              </span>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" style="width: ${j.progress}%; background: ${statusColor};"></div>
            </div>
            <div class="job-footer">
              <span>${escapeHtml(j.message || '')}</span>
              <span>${j.output_path ? escapeHtml(j.output_path.split(/[\\/]/).pop()) : ''}</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      // Ignored: polling network failure
    } finally {
      isFetchingJobs = false;
    }
  }

  setInterval(loadJobs, 2000);

  // =========================================================
  // SPOTIFY-STYLE MUSIC LIBRARY & PERSISTENT PLAYER ENGINE
  // =========================================================
  const audioPlayer = new Audio();
  audioPlayer.volume = 0.8;
  let currentPlayingTrack = null;
  let currentPlayingIndex = -1;
  let isShuffled = false;
  let isRepeated = false;

  const spotifyPlayerBar = document.getElementById('spotify-player-bar');
  const spPlayerArt = document.getElementById('player-art');
  const spPlayerTitle = document.getElementById('player-track-title');
  const spPlayerArtist = document.getElementById('player-track-artist');
  const spPlayerEqBars = document.getElementById('player-eq-bars');
  const spPlayerToggleBtn = document.getElementById('btn-player-toggle');
  const spPlayerPlayIcon = document.getElementById('player-play-icon');
  const spPlayerPrevBtn = document.getElementById('btn-player-prev');
  const spPlayerNextBtn = document.getElementById('btn-player-next');
  const spPlayerShuffleBtn = document.getElementById('btn-player-shuffle');
  const spPlayerRepeatBtn = document.getElementById('btn-player-repeat');
  const spPlayerTimeDisplay = document.getElementById('player-time-display');
  const spPlayerSeekContainer = document.getElementById('player-seek-container');
  const spPlayerProgressFill = document.getElementById('player-progress-fill');
  const spPlayerVolumeWrap = document.getElementById('volume-seek-bar');
  const spPlayerVolumeFill = document.getElementById('volume-progress-fill');
  const spPlayerMuteBtn = document.getElementById('btn-player-mute');
  const spPlayerCloseBtn = document.getElementById('btn-player-close');
  const spPlayerSyncBtn = document.getElementById('btn-player-sync');

  // Library DOM elements
  const libraryStatsLine = document.getElementById('library-stats-line');
  const libraryTbody = document.getElementById('library-tbody');
  const libraryGridView = document.getElementById('library-grid-view');
  const libraryListView = document.getElementById('library-list-view');
  const librarySearchInput = document.getElementById('library-search-input');
  const btnLibSearchClear = document.getElementById('btn-lib-search-clear');
  const librarySortSelect = document.getElementById('library-sort-select');
  const btnViewGrid = document.getElementById('btn-view-grid');
  const btnViewList = document.getElementById('btn-view-list');
  const subtabButtons = document.querySelectorAll('.lib-subtab');

  const badgeAlbums = document.getElementById('badge-albums-count');
  const badgeTracks = document.getElementById('badge-tracks-count');

  const btnLibUpgrade = document.getElementById('btn-lib-upgrade');
  const btnLibStorage = document.getElementById('btn-lib-storage');
  const btnLibRefresh = document.getElementById('btn-lib-refresh');

  let libraryTracks = [];
  let currentSubtab = 'albums'; // 'albums' | 'artists' | 'playlists' | 'tracks'
  let currentViewMode = 'grid'; // 'grid' | 'list'
  let libraryTotalSize = 0;

  const SP_PLAY_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>';
  const SP_PAUSE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>';
  const MINI_PLAY_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>';
  const MINI_PAUSE_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>';
  const TRASH_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

  function timeAgo(dateString) {
    if (!dateString) return 'Recently';
    const date = new Date(dateString.replace(' ', 'T'));
    if (isNaN(date.getTime())) return dateString;
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? '' : 's'} ago`;
    return date.toISOString().split('T')[0];
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 MB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Audio Playback Controller
  function playTrack(track, queue = null) {
    if (!track) return;
    currentPlayingTrack = track;
    const activeList = queue && queue.length ? queue : getFilteredAndSortedTracks();
    currentPlayingIndex = activeList.findIndex(t => t.id === track.id);
    if (currentPlayingIndex === -1) currentPlayingIndex = 0;

    if (spPlayerTitle) spPlayerTitle.textContent = track.title || 'Unknown Title';
    if (spPlayerArtist) spPlayerArtist.textContent = `${track.artist || 'Unknown Artist'}${track.album ? ' · ' + track.album : ''}`;
    if (spPlayerArt) spPlayerArt.src = `/api/cover?id=${track.id}`;

    if (spotifyPlayerBar) spotifyPlayerBar.style.display = 'block';
    document.body.classList.add('has-active-player');

    audioPlayer.src = `/api/stream?id=${track.id}`;
    audioPlayer.currentTime = 0;
    audioPlayer.play().then(() => {
      updatePlaybackUI(true);
    }).catch(err => {
      console.warn('Playback error:', err);
      updatePlaybackUI(false);
    });
  }

  function togglePlayPause() {
    if (!currentPlayingTrack) {
      const list = getFilteredAndSortedTracks();
      if (list.length) playTrack(list[0]);
      return;
    }
    if (audioPlayer.paused) {
      audioPlayer.play().then(() => updatePlaybackUI(true)).catch(e => console.warn(e));
    } else {
      audioPlayer.pause();
      updatePlaybackUI(false);
    }
  }

  function playNextTrack() {
    const list = getFilteredAndSortedTracks();
    if (!list.length) return;
    let nextIdx;
    if (isShuffled) {
      nextIdx = Math.floor(Math.random() * list.length);
    } else {
      nextIdx = (currentPlayingIndex + 1) % list.length;
    }
    playTrack(list[nextIdx], list);
  }

  function playPrevTrack() {
    const list = getFilteredAndSortedTracks();
    if (!list.length) return;
    if (audioPlayer.currentTime > 3) {
      audioPlayer.currentTime = 0;
      return;
    }
    let prevIdx;
    if (isShuffled) {
      prevIdx = Math.floor(Math.random() * list.length);
    } else {
      prevIdx = (currentPlayingIndex - 1 + list.length) % list.length;
    }
    playTrack(list[prevIdx], list);
  }

  function updatePlaybackUI(isPlaying) {
    if (spPlayerToggleBtn) {
      spPlayerToggleBtn.innerHTML = isPlaying ? SP_PAUSE_ICON : SP_PLAY_ICON;
    }
    if (spPlayerEqBars) {
      spPlayerEqBars.style.display = isPlaying ? 'inline-flex' : 'none';
    }

    // Update table rows
    document.querySelectorAll('.spotify-track-row').forEach(row => {
      const rowId = parseInt(row.dataset.id, 10);
      const isCurrent = currentPlayingTrack && currentPlayingTrack.id === rowId;
      row.classList.toggle('is-active', isCurrent);
      row.classList.toggle('is-playing', isCurrent && isPlaying);

      const playBtn = row.querySelector('.sp-row-play-btn');
      if (playBtn) {
        playBtn.innerHTML = (isCurrent && isPlaying) ? MINI_PAUSE_ICON : MINI_PLAY_ICON;
      }
    });
  }

  function stopPreview() {
    if (audioPlayer) {
      try {
        audioPlayer.pause();
      } catch (e) {}
    }
    updatePlaybackUI(false);
  }

  audioPlayer.addEventListener('timeupdate', () => {
    if (!audioPlayer.duration) return;
    const curr = audioPlayer.currentTime;
    const dur = audioPlayer.duration;
    const pct = (curr / dur) * 100;
    if (spPlayerProgressFill) spPlayerProgressFill.style.width = `${pct}%`;
    if (spPlayerTimeDisplay) {
      spPlayerTimeDisplay.textContent = `${formatDuration(curr)} / ${formatDuration(dur)}`;
    }
  });

  audioPlayer.addEventListener('ended', () => {
    if (isRepeated) {
      audioPlayer.currentTime = 0;
      audioPlayer.play();
    } else {
      playNextTrack();
    }
  });

  spPlayerSeekContainer?.addEventListener('click', (e) => {
    if (!audioPlayer.duration) return;
    const rect = spPlayerSeekContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioPlayer.currentTime = ratio * audioPlayer.duration;
  });

  spPlayerVolumeWrap?.addEventListener('click', (e) => {
    const rect = spPlayerVolumeWrap.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioPlayer.volume = ratio;
    if (spPlayerVolumeFill) spPlayerVolumeFill.style.width = `${ratio * 100}%`;
  });

  spPlayerMuteBtn?.addEventListener('click', () => {
    if (audioPlayer.volume > 0) {
      audioPlayer.dataset.lastVol = audioPlayer.volume;
      audioPlayer.volume = 0;
      if (spPlayerVolumeFill) spPlayerVolumeFill.style.width = '0%';
    } else {
      const restored = parseFloat(audioPlayer.dataset.lastVol || '0.8');
      audioPlayer.volume = restored;
      if (spPlayerVolumeFill) spPlayerVolumeFill.style.width = `${restored * 100}%`;
    }
  });

  spPlayerToggleBtn?.addEventListener('click', togglePlayPause);
  spPlayerPrevBtn?.addEventListener('click', playPrevTrack);
  spPlayerNextBtn?.addEventListener('click', playNextTrack);

  spPlayerShuffleBtn?.addEventListener('click', () => {
    isShuffled = !isShuffled;
    spPlayerShuffleBtn.classList.toggle('active', isShuffled);
  });

  spPlayerRepeatBtn?.addEventListener('click', () => {
    isRepeated = !isRepeated;
    spPlayerRepeatBtn.classList.toggle('active', isRepeated);
  });

  spPlayerCloseBtn?.addEventListener('click', () => {
    audioPlayer.pause();
    updatePlaybackUI(false);
    if (spotifyPlayerBar) spotifyPlayerBar.style.display = 'none';
    document.body.classList.remove('has-active-player');
  });

  // Library Data & Rendering
  async function loadLibrary(bypassCache = false) {
    try {
      const url = '/api/library' + (bypassCache ? '?_t=' + Date.now() : '');
      const res = await fetch(url);
      const data = await res.json();
      libraryTracks = data.tracks || [];
      libraryTotalSize = data.total_size || 0;
      updateLibraryStats();
      renderCurrentLibraryView();
      if (typeof loadHomeStats === 'function') loadHomeStats();
    } catch (e) {
      console.error('Error loading library:', e);
    }
  }

  function updateLibraryStats() {
    const totalTracks = libraryTracks.length;
    const uniqueAlbums = new Set(libraryTracks.map(t => t.album).filter(Boolean));
    const uniqueArtists = new Set(libraryTracks.map(t => t.artist).filter(Boolean));

    if (badgeAlbums) badgeAlbums.textContent = uniqueAlbums.size;
    if (badgeTracks) badgeTracks.textContent = totalTracks;

    if (libraryStatsLine) {
      libraryStatsLine.textContent = `${totalTracks} tracks · ${uniqueAlbums.size} albums · ${uniqueArtists.size} artists · ${formatBytes(libraryTotalSize)}`;
    }
  }

  function getFilteredAndSortedTracks() {
    let list = [...libraryTracks];
    const q = (librarySearchInput?.value || '').toLowerCase().trim();
    if (q) {
      list = list.filter(t => 
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.artist && t.artist.toLowerCase().includes(q)) ||
        (t.album && t.album.toLowerCase().includes(q)) ||
        (t.genre && t.genre.toLowerCase().includes(q))
      );
    }

    const sort = librarySortSelect?.value || 'recent';
    if (sort === 'title_asc') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sort === 'artist_asc') {
      list.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
    } else if (sort === 'album_asc') {
      list.sort((a, b) => (a.album || '').localeCompare(b.album || ''));
    } else if (sort === 'year_desc') {
      list.sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
    } else if (sort === 'duration_desc') {
      list.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    } else {
      list.sort((a, b) => new Date(b.downloaded_at || 0) - new Date(a.downloaded_at || 0));
    }

    return list;
  }

  function renderCurrentLibraryView() {
    const tracks = getFilteredAndSortedTracks();

    // If tracks subtab is chosen OR list view is explicitly toggled, show Table (Image 1)
    if (currentSubtab === 'tracks' || currentViewMode === 'list') {
      if (libraryGridView) libraryGridView.style.display = 'none';
      if (libraryListView) libraryListView.style.display = 'block';
      renderTableView(tracks);
    } else {
      // Show Grid Cards (Image 2)
      if (libraryListView) libraryListView.style.display = 'none';
      if (libraryGridView) libraryGridView.style.display = 'grid';
      renderAlbumsGrid(tracks);
    }
  }

  // 1. ALBUMS GRID (Image 2)
  function renderAlbumsGrid(tracks) {
    if (!tracks.length) {
      libraryGridView.innerHTML = '<div style="grid-column: 1 / -1; padding: 3rem; text-align: center; color: var(--text-dim);">No albums found in your library.</div>';
      return;
    }

    // Group tracks by album
    const albumMap = new Map();
    tracks.forEach(t => {
      const albName = t.album || 'Single Tracks';
      if (!albumMap.has(albName)) {
        albumMap.set(albName, []);
      }
      albumMap.get(albName).push(t);
    });

    let html = '';
    albumMap.forEach((albTracks, albName) => {
      const sample = albTracks[0];
      const artist = sample.artist || 'Various Artists';
      const year = sample.year || (sample.downloaded_at ? sample.downloaded_at.slice(0, 4) : '');
      const coverUrl = `/api/cover?id=${sample.id}&album=${encodeURIComponent(albName)}`;

      html += `
        <div class="album-card" data-album="${escapeHtml(albName)}">
          <div class="album-art-wrap">
            <img src="${coverUrl}" class="album-art" alt="${escapeHtml(albName)}" loading="lazy">
            <button type="button" class="album-more-btn" title="View Tracks" data-album="${escapeHtml(albName)}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle><circle cx="5" cy="12" r="2"></circle></svg>
            </button>
            <button type="button" class="album-play-btn" title="Play ${escapeHtml(albName)}" data-id="${sample.id}">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
            </button>
          </div>
          <div class="album-info">
            <div class="album-title" title="${escapeHtml(albName)}">${escapeHtml(albName)}</div>
            <div class="album-sub">${escapeHtml(artist)}${year ? ' · ' + escapeHtml(year) : ''}</div>
          </div>
        </div>
      `;
    });

    libraryGridView.innerHTML = html;

    // Click card -> Play album tracks without changing view mode
    libraryGridView.querySelectorAll('.album-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // If clicking the 3-dots more button, view album tracks in list mode
        if (e.target.closest('.album-more-btn')) {
          e.stopPropagation();
          const alb = card.dataset.album;
          if (librarySearchInput) {
            librarySearchInput.value = alb;
            if (btnLibSearchClear) btnLibSearchClear.style.display = 'inline-flex';
          }
          currentSubtab = 'tracks';
          currentViewMode = 'list';
          updateSubtabUI();
          renderCurrentLibraryView();
          return;
        }

        if (e.target.closest('.album-play-btn')) return;

        // Clicking anywhere on the cover / card plays the album
        const alb = card.dataset.album;
        const albTracks = albumMap.get(alb);
        if (albTracks && albTracks.length) {
          playTrack(albTracks[0], albTracks);
        }
      });
    });

    // Play button on card
    libraryGridView.querySelectorAll('.album-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        const tr = libraryTracks.find(t => t.id === id);
        if (tr) {
          const alb = tr.album || 'Single Tracks';
          const albTracks = albumMap.get(alb) || [tr];
          playTrack(tr, albTracks);
        }
      });
    });
  }

  // 2. SPOTIFY TRACK TABLE VIEW (Image 1)
  function renderTableView(tracks) {
    if (!tracks || tracks.length === 0) {
      libraryTbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 3rem; color: var(--text-dim);">No matching tracks in your library.</td></tr>';
      return;
    }

    libraryTbody.innerHTML = tracks.map((t, idx) => {
      const isCurrent = currentPlayingTrack && currentPlayingTrack.id === t.id;
      const isPlaying = isCurrent && !audioPlayer.paused;
      const addedText = timeAgo(t.downloaded_at);
      const releaseDate = t.year || (t.downloaded_at ? t.downloaded_at.slice(0, 10) : '-');
      const fmt = (t.format || 'mp3').toUpperCase();
      const coverUrl = `/api/cover?id=${t.id}`;

      return `
        <tr class="spotify-track-row ${isCurrent ? 'is-active' : ''} ${isPlaying ? 'is-playing' : ''}" data-id="${t.id}">
          <td class="sp-col-num">
            <span class="sp-num-text">${idx + 1}</span>
            <button type="button" class="sp-row-play-btn" data-id="${t.id}" title="Play Track">
              ${isPlaying ? MINI_PAUSE_ICON : MINI_PLAY_ICON}
            </button>
          </td>
          <td>
            <div class="sp-title-cell">
              <img src="${coverUrl}" class="sp-track-thumb" alt="${escapeHtml(t.title)}" loading="lazy">
              <div style="min-width: 0; overflow: hidden;">
                <div class="sp-col-title-text" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
                <div class="sp-col-artist-text" title="${escapeHtml(t.artist)}">${escapeHtml(t.artist)}</div>
              </div>
            </div>
          </td>
          <td style="color: var(--text-muted); font-size: 0.85rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(t.album || '-')}">
            ${escapeHtml(t.album || '-')}
          </td>
          <td style="text-align: center;">
            <span class="sp-format-tag">${fmt}</span>
          </td>
          <td class="sp-date-text">${escapeHtml(addedText)}</td>
          <td class="sp-date-text">${escapeHtml(releaseDate)}</td>
          <td class="sp-duration-text" style="text-align: right;">${formatDuration(t.duration)}</td>
          <td>
            <div class="sp-actions-cell">
              <button type="button" class="btn-delete-track" data-id="${t.id}" data-title="${escapeHtml(t.title)}" data-artist="${escapeHtml(t.artist)}" title="Delete from disk & library">
                ${TRASH_ICON}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row play events
    libraryTbody.querySelectorAll('.sp-row-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        if (currentPlayingTrack && currentPlayingTrack.id === id) {
          togglePlayPause();
        } else {
          const tr = libraryTracks.find(t => t.id === id);
          if (tr) playTrack(tr, tracks);
        }
      });
    });

    // Double click row to play
    libraryTbody.querySelectorAll('.spotify-track-row').forEach(row => {
      row.addEventListener('dblclick', () => {
        const id = parseInt(row.dataset.id, 10);
        const tr = libraryTracks.find(t => t.id === id);
        if (tr) playTrack(tr, tracks);
      });
    });

    // Delete buttons in table
    libraryTbody.querySelectorAll('.btn-delete-track').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        const title = btn.dataset.title || 'this track';
        const artist = btn.dataset.artist || '';

        const msg = `Are you sure you want to delete "${title}${artist ? ' - ' + artist : ''}"?\n\n• The audio file will be deleted from disk\n• The track will be removed from your database and Navidrome`;
        if (!confirm(msg)) return;

        if (currentPlayingTrack && currentPlayingTrack.id === id) {
          audioPlayer.pause();
          spotifyPlayerBar.style.display = 'none';
          document.body.classList.remove('has-active-player');
          currentPlayingTrack = null;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="display:inline-block; width:12px; height:12px; border-width:2px; border-top-color:var(--error);"></span>';

        try {
          const res = await fetch('/api/library/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            libraryTracks = libraryTracks.filter(t => t.id !== id);
            updateLibraryStats();
            renderCurrentLibraryView();
            loadHomeStats();
          } else {
            alert(data.message || 'Error deleting track');
            btn.disabled = false;
            btn.innerHTML = TRASH_ICON;
          }
        } catch (err) {
          alert('Network error while deleting track: ' + err.message);
          btn.disabled = false;
          btn.innerHTML = TRASH_ICON;
        }
      });
    });
  }

  // Subtab switching (Albums, Artists, Playlists, Tracks)
  function updateSubtabUI() {
    subtabButtons.forEach(btn => {
      const match = btn.dataset.subtab === currentSubtab;
      btn.classList.toggle('active', match);
    });
    btnViewGrid?.classList.toggle('active', currentViewMode === 'grid');
    btnViewList?.classList.toggle('active', currentViewMode === 'list');
  }

  subtabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      currentSubtab = btn.dataset.subtab;
      if (currentSubtab === 'tracks') {
        currentViewMode = 'list';
      } else {
        currentViewMode = 'grid';
      }
      updateSubtabUI();
      renderCurrentLibraryView();
    });
  });

  // View mode switcher buttons (Grid & List)
  btnViewGrid?.addEventListener('click', () => {
    currentViewMode = 'grid';
    if (currentSubtab === 'tracks') currentSubtab = 'albums';
    updateSubtabUI();
    renderCurrentLibraryView();
  });

  btnViewList?.addEventListener('click', () => {
    currentViewMode = 'list';
    updateSubtabUI();
    renderCurrentLibraryView();
  });

  // Search input & sort selection
  librarySearchInput?.addEventListener('input', () => {
    const val = (librarySearchInput.value || '').trim();
    if (btnLibSearchClear) {
      btnLibSearchClear.style.display = val ? 'inline-flex' : 'none';
    }
    renderCurrentLibraryView();
  });

  btnLibSearchClear?.addEventListener('click', () => {
    if (librarySearchInput) {
      librarySearchInput.value = '';
      librarySearchInput.focus();
    }
    btnLibSearchClear.style.display = 'none';
    renderCurrentLibraryView();
  });

  librarySortSelect?.addEventListener('change', () => {
    renderCurrentLibraryView();
  });

  // Library Action Buttons
  btnLibUpgrade?.addEventListener('click', async () => {
    btnLibUpgrade.disabled = true;
    const origHtml = btnLibUpgrade.innerHTML;
    btnLibUpgrade.innerHTML = '<span class="spinner" style="display:inline-block; width:12px; height:12px; border-width:2px; border-top-color:#1ed760;"></span> Scanning...';
    try {
      const res = await fetch('/api/navidrome/scan', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('Navidrome Subsonic Library scan triggered successfully!');
      } else {
        alert(data.message || 'Navidrome is not enabled or not reachable.');
      }
    } catch (e) {
      alert('Error triggering library scan: ' + e.message);
    } finally {
      btnLibUpgrade.disabled = false;
      btnLibUpgrade.innerHTML = origHtml;
    }
  });

  btnLibStorage?.addEventListener('click', () => {
    const totalTracks = libraryTracks.length;
    const uniqueAlbums = new Set(libraryTracks.map(t => t.album).filter(Boolean)).size;
    const uniqueArtists = new Set(libraryTracks.map(t => t.artist).filter(Boolean)).size;
    alert(`Music Library Storage & Usage:\n\n• Tracks: ${totalTracks}\n• Albums: ${uniqueAlbums}\n• Artists: ${uniqueArtists}\n• Total Disk Usage: ${formatBytes(libraryTotalSize)}\n• Storage Location: storage/downloads`);
  });

  btnLibRefresh?.addEventListener('click', async () => {
    const svg = btnLibRefresh.querySelector('svg');
    if (svg) svg.classList.add('spin-animation');
    btnLibRefresh.disabled = true;
    try {
      await loadLibrary(true);
    } finally {
      setTimeout(() => {
        if (svg) svg.classList.remove('spin-animation');
        btnLibRefresh.disabled = false;
      }, 500);
    }
  });

  // Alias for backward compatibility
  function renderLibrary(tracks) {
    if (tracks) libraryTracks = tracks;
    updateLibraryStats();
    renderCurrentLibraryView();
  }

  // Settings & Navidrome
  const settingsForm = document.getElementById('settings-form');
  const saveStatus = document.getElementById('save-status');
  const btnTestNavidrome = document.getElementById('btn-test-navidrome');
  const btnScanNavidrome = document.getElementById('btn-scan-navidrome');
  const navidromeFeedback = document.getElementById('navidrome-feedback');
  const navidromeBadge = document.getElementById('navidrome-badge');
  const authBadge = document.getElementById('auth-badge');
  const selectAudioFormat = document.getElementById('audio_format');
  const selectAudioBitrate = document.getElementById('audio_bitrate');
  const currentAuthUserEl = document.getElementById('current-auth-username');
  const secNewUsernameInput = document.getElementById('sec-new-username');

  // Password visibility toggles
  document.querySelectorAll('.btn-toggle-password').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btn.innerHTML = isPass
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    });
  });

  // Handle FLAC Lossless vs Bitrate select
  function updateBitrateAvailability() {
    if (!selectAudioFormat || !selectAudioBitrate) return;
    const isFlac = selectAudioFormat.value === 'flac';
    selectAudioBitrate.disabled = isFlac;
    if (isFlac) {
      selectAudioBitrate.title = 'FLAC is a lossless format (fixed bitrates do not apply)';
    } else {
      selectAudioBitrate.title = '';
    }
  }
  selectAudioFormat?.addEventListener('change', updateBitrateAvailability);

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      const s = data.settings || {};

      for (const [key, val] of Object.entries(s)) {
        const input = settingsForm.elements[key];
        if (input) {
          if (input.type === 'checkbox') {
            input.checked = ['1', 'true', 'yes', 'on'].includes(String(val).toLowerCase());
          } else {
            input.value = val;
          }
        }
      }

      if (s.auth_username) {
        if (currentAuthUserEl) currentAuthUserEl.textContent = s.auth_username;
        if (secNewUsernameInput) secNewUsernameInput.placeholder = `Keep current (${s.auth_username})`;
      }

      updateNavidromeBadge();
      updateAuthBadge();
      updateBitrateAvailability();
    } catch (e) {
      console.error(e);
    }
  }

  function updateNavidromeBadge() {
    const isEnabled = settingsForm.elements['navidrome_enabled']?.checked;
    if (isEnabled) {
      navidromeBadge.textContent = 'Active';
      navidromeBadge.classList.add('online');
    } else {
      navidromeBadge.textContent = 'Disabled';
      navidromeBadge.classList.remove('online');
    }
  }

  function updateAuthBadge() {
    if (authBadge) {
      authBadge.textContent = 'Protected';
      authBadge.classList.add('online');
    }
    if (btnLogout) {
      btnLogout.style.display = 'inline-flex';
    }
  }

  settingsForm.elements['navidrome_enabled']?.addEventListener('change', updateNavidromeBadge);

  const checkboxKeys = [
    'organize_by_artist', 'organize_by_album', 'include_track_number',
    'save_cover_image', 'save_m3u',
    'navidrome_enabled', 'navidrome_auto_scan'
  ];

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(settingsForm);
    const payload = {};

    for (const [k, v] of formData.entries()) {
      payload[k] = v;
    }

    checkboxKeys.forEach(cb => {
      payload[cb] = settingsForm.elements[cb]?.checked ? '1' : '0';
    });

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      saveStatus.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> ${json.message || 'Settings saved'}`;
      saveStatus.style.display = 'inline-flex';
      setTimeout(() => {
        saveStatus.style.display = 'none';
      }, 3500);
      updateNavidromeBadge();
      updateAuthBadge();
      updateBitrateAvailability();
    } catch {
      alert('Failed to save settings.');
    }
  });

  // Test Navidrome connection
  btnTestNavidrome?.addEventListener('click', async () => {
    navidromeFeedback.style.display = 'none';
    btnTestNavidrome.disabled = true;

    try {
      const res = await fetch('/api/navidrome/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: settingsForm.elements['navidrome_url'].value,
          user: settingsForm.elements['navidrome_user'].value,
          pass: settingsForm.elements['navidrome_pass'].value
        })
      });
      const data = await res.json();

      navidromeFeedback.className = `alert-box ${data.success ? 'alert-success' : 'alert-error'}`;
      navidromeFeedback.textContent = data.message;
      navidromeFeedback.style.display = 'block';
    } catch (err) {
      navidromeFeedback.className = 'alert-box alert-error';
      navidromeFeedback.textContent = 'Connection error: ' + err.message;
      navidromeFeedback.style.display = 'block';
    } finally {
      btnTestNavidrome.disabled = false;
    }
  });

  // Manual Navidrome scan
  btnScanNavidrome?.addEventListener('click', async () => {
    navidromeFeedback.style.display = 'none';
    btnScanNavidrome.disabled = true;

    try {
      const res = await fetch('/api/navidrome/scan', { method: 'POST' });
      const data = await res.json();

      navidromeFeedback.className = `alert-box ${data.success ? 'alert-success' : 'alert-error'}`;
      navidromeFeedback.textContent = data.message;
      navidromeFeedback.style.display = 'block';
    } catch (err) {
      navidromeFeedback.className = 'alert-box alert-error';
      navidromeFeedback.textContent = 'Failed to request scan: ' + err.message;
      navidromeFeedback.style.display = 'block';
    } finally {
      btnScanNavidrome.disabled = false;
    }
  });

  // --- Authentication & LAN Security Logic ---
  const btnLogout = document.getElementById('btn-logout');
  const btnUpdateCredentials = document.getElementById('btn-update-credentials');
  const credentialsFeedback = document.getElementById('credentials-feedback');

  async function checkAuthStatus() {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      if (!data.authenticated) {
        window.location.href = '/login.php';
        return false;
      }
      if (btnLogout) btnLogout.style.display = 'inline-flex';
      return true;
    } catch {
      return false;
    }
  }

  btnLogout?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to sign out of Sounify Pi?')) {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) {}
      window.location.href = '/login.php';
    }
  });

  // Prevent Enter key in credentials inputs from submitting the main settings form
  const credInputs = document.querySelectorAll('#credentials-inputs-group input');
  credInputs.forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        btnUpdateCredentials?.click();
      }
    });
  });

  btnUpdateCredentials?.addEventListener('click', async () => {
    if (credentialsFeedback) credentialsFeedback.style.display = 'none';
    const newUsername = document.getElementById('sec-new-username').value.trim();
    const currentPassword = document.getElementById('sec-current-password').value;
    const newPassword = document.getElementById('sec-new-password').value;
    const confirmPassword = document.getElementById('sec-confirm-password').value;

    if (!currentPassword) {
      showCredentialsFeedback('Please enter your current password to confirm changes.', 'error');
      return;
    }

    if (newPassword) {
      if (newPassword.length < 4) {
        showCredentialsFeedback('New password must be at least 4 characters long.', 'error');
        return;
      }
      if (newPassword !== confirmPassword) {
        showCredentialsFeedback('New passwords do not match.', 'error');
        return;
      }
    }

    if (!newUsername && !newPassword) {
      showCredentialsFeedback('Please enter a new username or new password.', 'error');
      return;
    }

    btnUpdateCredentials.disabled = true;
    try {
      const res = await fetch('/api/auth/update-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_username: newUsername,
          new_password: newPassword
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showCredentialsFeedback(data.message || 'Credentials updated successfully.', 'success');
        if (newUsername) {
          if (currentAuthUserEl) currentAuthUserEl.textContent = newUsername;
          if (secNewUsernameInput) secNewUsernameInput.placeholder = `Keep current (${newUsername})`;
        }
        document.getElementById('sec-current-password').value = '';
        document.getElementById('sec-new-password').value = '';
        document.getElementById('sec-confirm-password').value = '';
        document.getElementById('sec-new-username').value = '';
      } else {
        showCredentialsFeedback(data.message || 'Failed to update credentials.', 'error');
      }
    } catch {
      showCredentialsFeedback('Network error while connecting to server.', 'error');
    } finally {
      btnUpdateCredentials.disabled = false;
    }
  });

  function showCredentialsFeedback(msg, type) {
    if (!credentialsFeedback) return;
    credentialsFeedback.textContent = msg;
    credentialsFeedback.style.color = type === 'success' ? 'var(--accent-primary)' : 'var(--error)';
    credentialsFeedback.style.display = 'inline-block';
    setTimeout(() => {
      credentialsFeedback.style.display = 'none';
    }, 5000);
  }

  // --- Database & Storage Maintenance ---
  const btnCleanDatabase = document.getElementById('btn-clean-database');
  const cleanKeepAudioFiles = document.getElementById('clean-keep-audio-files');
  const cleanDbFeedback = document.getElementById('clean-db-feedback');

  btnCleanDatabase?.addEventListener('click', async () => {
    const keepFiles = cleanKeepAudioFiles ? cleanKeepAudioFiles.checked : true;
    const confirmPrompt = keepFiles
      ? 'Are you sure you want to clean the database?\n\n• All download history and queue records will be wiped from SQLite.\n• Audio files (MP3/FLAC) WILL be kept on disk.'
      : 'WARNING: Are you sure you want to clean the database AND delete all downloaded audio files from disk?\n\n• SQLite history and jobs will be wiped.\n• All physical music files in the download folder will be PERMANENTLY deleted!\n\nThis cannot be undone. Proceed?';

    if (!confirm(confirmPrompt)) {
      return;
    }

    if (cleanDbFeedback) {
      cleanDbFeedback.style.display = 'none';
    }

    btnCleanDatabase.disabled = true;
    const originalText = btnCleanDatabase.innerHTML;
    btnCleanDatabase.innerHTML = `<span class="spinner" style="display:inline-block; border-top-color: var(--error);"></span> Cleaning...`;

    try {
      const res = await fetch('/api/database/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_files: keepFiles })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showCleanDbFeedback(data.message || 'Database cleaned successfully.', 'success');
        loadHomeStats();
        if (typeof loadLibrary === 'function') loadLibrary();
        if (typeof loadJobs === 'function') loadJobs();
      } else {
        showCleanDbFeedback(data.message || 'Failed to clean database.', 'error');
      }
    } catch {
      showCleanDbFeedback('Network error while connecting to server.', 'error');
    } finally {
      btnCleanDatabase.disabled = false;
      btnCleanDatabase.innerHTML = originalText;
    }
  });

  function showCleanDbFeedback(msg, type) {
    if (!cleanDbFeedback) return;
    cleanDbFeedback.textContent = msg;
    cleanDbFeedback.style.color = type === 'success' ? 'var(--accent-primary)' : 'var(--error)';
    cleanDbFeedback.style.display = 'inline-block';
    setTimeout(() => {
      cleanDbFeedback.style.display = 'none';
    }, 6000);
  }

  // Interceptar 401 en fetch para redirigir a login.php
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await originalFetch(...args);
    const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    if (res.status === 401 && !reqUrl.includes('/api/auth/status')) {
      window.location.href = '/login.php';
    }
    return res;
  };

  // Initialize Auth Check & Home tab on startup
  checkAuthStatus().then(authed => {
    if (authed) {
      loadHomeStats();
    }
  });

  // Utilities
  function setLoading(btn, isLoading) {
    btn.disabled = isLoading;
    const text = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner');
    if (text) text.style.display = isLoading ? 'none' : 'inline';
    if (spinner) spinner.style.display = isLoading ? 'inline-block' : 'none';
  }

  function formatDuration(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const total = Math.floor(Number(sec));
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }
});
