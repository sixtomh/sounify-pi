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

  // 20-Second Audio Preview Player Controls
  const audioPreview = new Audio();
  const playerBar = document.getElementById('library-preview-player');
  const playerTitle = document.getElementById('player-track-title');
  const playerArtist = document.getElementById('player-track-artist');
  const playerCurrTime = document.getElementById('player-curr-time');
  const playerProgressFill = document.getElementById('player-progress-fill');
  const btnPlayerStop = document.getElementById('btn-player-stop');

  let currentPlayingId = null;

  const PLAY_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>';
  const PAUSE_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>';

  function stopPreview() {
    if (audioPreview) {
      try {
        audioPreview.pause();
        audioPreview.currentTime = 0;
      } catch (e) {}
    }
    if (playerBar) playerBar.style.display = 'none';
    document.querySelectorAll('.btn-preview-play').forEach(btn => {
      btn.innerHTML = PLAY_ICON;
      btn.classList.remove('playing');
    });
    currentPlayingId = null;
  }

  // Navigation Tabs (Ordered: Home, Search, Downloads, Library, History, Settings)
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');

  function switchTab(tabId) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    panels.forEach(p => p.classList.toggle('active', p.id === `panel-${tabId}`));

    if (tabId !== 'library') {
      stopPreview();
    }

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
        if (json.output_path && item.playlistContext) {
          item.playlistContext.downloadedPaths.push(json.output_path);
          if (item.playlistContext.downloadedPaths.length === item.playlistContext.totalTracks) {
            triggerM3uGeneration(item.playlistContext);
          }
        }
      } catch (e) {
        console.error('Error downloading queued track:', e);
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
    } catch (e) {
      console.warn('Failed to generate M3U playlist:', e);
    }
  }

  function updateQueueBadge() {
    const totalPending = downloadQueue.length;
    if (totalPending > 0) {
      queueBadge.textContent = totalPending;
      queueBadge.style.display = 'inline-block';
    }
  }

  // Active Downloads & Jobs Polling
  const jobsList = document.getElementById('jobs-list');
  const queueBadge = document.getElementById('queue-badge');
  const clearJobsBtn = document.getElementById('clear-jobs-btn');

  clearJobsBtn?.addEventListener('click', async () => {
    await fetch('/api/clear-completed', { method: 'POST' });
    loadJobs();
  });

  async function loadJobs() {
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      const jobs = data.jobs || [];

      const activeCount = jobs.filter(j => j.status === 'downloading' || j.status === 'pending').length;
      if (activeCount > 0) {
        queueBadge.textContent = activeCount;
        queueBadge.style.display = 'inline-block';
      } else {
        queueBadge.style.display = 'none';
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
      console.error(e);
    }
  }

  setInterval(loadJobs, 2000);

  // 20-Second Audio Preview Player Events
  btnPlayerStop?.addEventListener('click', stopPreview);

  audioPreview.ontimeupdate = () => {
    const cur = audioPreview.currentTime;
    if (playerCurrTime) {
      playerCurrTime.textContent = `0:${Math.floor(cur).toString().padStart(2, '0')}`;
    }
    if (playerProgressFill) {
      const pct = Math.min(100, (cur / 20) * 100);
      playerProgressFill.style.width = `${pct}%`;
    }
    // Limit to exactly 20 seconds
    if (cur >= 20) {
      stopPreview();
    }
  };

  audioPreview.onended = () => {
    stopPreview();
  };

  audioPreview.onerror = () => {
    console.warn('Audio preview streaming failed');
    stopPreview();
  };

  // Library View
  const libraryTbody = document.getElementById('library-tbody');
  const librarySearchInput = document.getElementById('library-search-input');
  let libraryTracks = [];

  async function loadLibrary() {
    try {
      const res = await fetch('/api/library');
      const data = await res.json();
      libraryTracks = data.tracks || [];
      renderLibrary(libraryTracks);
    } catch (e) {
      console.error(e);
    }
  }

  function renderLibrary(tracks) {
    if (!tracks || tracks.length === 0) {
      libraryTbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 2.5rem; color: var(--text-dim);">Your library is currently empty. Go to Search to download music!</td></tr>';
      return;
    }

    libraryTbody.innerHTML = tracks.map((t, idx) => {
      const isPlaying = currentPlayingId === t.id && !audioPreview.paused;
      return `
      <tr>
        <td style="text-align: center;">
          <button class="btn-play-mini btn-preview-play ${isPlaying ? 'playing' : ''}" data-id="${t.id}" data-title="${escapeHtml(t.title)}" data-artist="${escapeHtml(t.artist)}" title="Preview 20s">
            ${isPlaying ? PAUSE_ICON : PLAY_ICON}
          </button>
        </td>
        <td style="color: var(--text-dim); font-weight: 600;">${idx + 1}</td>
        <td>
          <div style="font-weight: 700; color: #ffffff;">${escapeHtml(t.title)}</div>
          <div style="font-size: 0.82rem; color: var(--text-muted);">${escapeHtml(t.artist)}</div>
        </td>
        <td>${escapeHtml(t.album || '-')}</td>
        <td><span class="preview-tag" style="padding: 2px 8px;">${(t.format || 'mp3').toUpperCase()}</span></td>
        <td>${formatDuration(t.duration)}</td>
        <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(t.file_path)}">
          ${escapeHtml(t.file_path)}
        </td>
      </tr>
    `}).join('');

    libraryTbody.querySelectorAll('.btn-preview-play').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const title = btn.dataset.title;
        const artist = btn.dataset.artist;

        if (currentPlayingId === id && !audioPreview.paused) {
          stopPreview();
          return;
        }

        document.querySelectorAll('.btn-preview-play').forEach(b => {
          b.innerHTML = PLAY_ICON;
          b.classList.remove('playing');
        });

        currentPlayingId = id;
        btn.innerHTML = PAUSE_ICON;
        btn.classList.add('playing');

        if (playerTitle) playerTitle.textContent = title;
        if (playerArtist) playerArtist.textContent = `${artist} · 20s Preview`;
        if (playerCurrTime) playerCurrTime.textContent = '0:00';
        if (playerProgressFill) playerProgressFill.style.width = '0%';
        if (playerBar) playerBar.style.display = 'flex';

        audioPreview.src = `/api/stream?id=${id}`;
        audioPreview.currentTime = 0;
        audioPreview.play().catch(e => {
          console.warn('Playback error:', e);
          stopPreview();
        });
      });
    });
  }

  librarySearchInput?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderLibrary(libraryTracks);
      return;
    }
    const filtered = libraryTracks.filter(t => 
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.artist && t.artist.toLowerCase().includes(q)) ||
      (t.album && t.album.toLowerCase().includes(q))
    );
    renderLibrary(filtered);
  });

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
    if (res.status === 401 && !args[0].includes('/api/auth/status')) {
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
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }
});
