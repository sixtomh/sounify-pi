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

  // Floating Toast Notifications System
  const toastContainer = document.getElementById('sp-toast-container');
  function showToast(message, type = 'info', duration = 3500) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `sp-toast sp-toast-${type}`;
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else {
      iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }
    toast.innerHTML = `<span class="sp-toast-icon">${iconSvg}</span><span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 320);
    }, duration);
  }

  // Smart Clipboard Detection for Search Tab
  const clipboardPill = document.getElementById('clipboard-search-pill');
  const clipboardUrlPreview = document.getElementById('clipboard-preview-url');
  const btnClipboardPaste = document.getElementById('btn-clipboard-paste-now');
  const btnClipboardDismiss = document.getElementById('btn-clipboard-dismiss');
  let lastDismissedClipboardUrl = '';

  async function checkClipboardForSpotify() {
    if (!navigator.clipboard || !navigator.clipboard.readText) return;
    try {
      const text = (await navigator.clipboard.readText()).trim();
      const match = text.match(/https?:\/\/open\.spotify\.com\/(track|album|playlist|artist)\/[a-zA-Z0-9]+/i);
      if (match && match[0]) {
        const foundUrl = match[0];
        if (foundUrl === lastDismissedClipboardUrl) return;
        if (clipboardPill && clipboardUrlPreview) {
          const shortUrl = foundUrl.length > 55 ? foundUrl.slice(0, 52) + '...' : foundUrl;
          clipboardUrlPreview.textContent = shortUrl;
          clipboardPill.style.display = 'flex';

          if (btnClipboardPaste) {
            btnClipboardPaste.onclick = () => {
              if (urlInput) {
                urlInput.value = foundUrl;
                clipboardPill.style.display = 'none';
                resolveForm?.dispatchEvent(new Event('submit'));
              }
            };
          }

          if (btnClipboardDismiss) {
            btnClipboardDismiss.onclick = () => {
              clipboardPill.style.display = 'none';
              lastDismissedClipboardUrl = foundUrl;
            };
          }
        }
      }
    } catch {
      // Clipboard read permission might be denied or document unfocused, silently ignore
    }
  }

  window.addEventListener('focus', () => {
    if (document.getElementById('panel-search')?.classList.contains('active')) {
      checkClipboardForSpotify();
    }
  });

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
      checkClipboardForSpotify();
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
  document.getElementById('btn-home-view-all')?.addEventListener('click', () => switchTab('library'));

  // Dynamic Home Greeting (Good morning / Good afternoon / Good evening)
  function updateGreeting() {
    const greetingEl = document.getElementById('home-greeting-heading');
    if (!greetingEl) return;
    const hour = new Date().getHours();
    let text = 'Good evening';
    if (hour >= 5 && hour < 12) {
      text = 'Good morning';
    } else if (hour >= 12 && hour < 18) {
      text = 'Good afternoon';
    }
    greetingEl.textContent = text;
  }
  updateGreeting();

  // Home Quick Download / Search Bar
  const homeQuickForm = document.getElementById('home-quick-download-form');
  const homeQuickInput = document.getElementById('home-quick-url-input');

  homeQuickForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = (homeQuickInput?.value || '').trim();
    if (!query) return;

    // Switch to search tab, populate and submit resolve form
    switchTab('search');
    const searchUrlInput = document.getElementById('spotify-url-input');
    const searchResolveForm = document.getElementById('resolve-form');
    if (searchUrlInput) {
      searchUrlInput.value = query;
      searchResolveForm?.dispatchEvent(new Event('submit'));
    }
    homeQuickForm.reset();
  });

  // Load Home Stats & Recents
  async function loadHomeStats() {
    updateGreeting();
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      const stats = data.stats || {};

      document.getElementById('home-stat-total').textContent = stats.total_tracks ?? 0;
      document.getElementById('home-stat-active').textContent = stats.active_jobs ?? 0;
      document.getElementById('home-stat-format').textContent = (stats.audio_format || 'MP3').toUpperCase();
      
      const navStatusEl = document.getElementById('home-stat-navidrome');
      if (navStatusEl) {
        if (stats.navidrome_enabled) {
          navStatusEl.textContent = 'Active';
          navStatusEl.style.color = 'var(--accent-primary)';
        } else {
          navStatusEl.textContent = 'Disabled';
          navStatusEl.style.color = 'var(--text-muted)';
        }
      }

      // Storage & Disk Space (Orange Pi Telemetry)
      if (stats.storage) {
        renderStorageStats(stats.storage);
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
  const pasteHeaderBtn = document.getElementById('btn-search-paste-header');
  const urlInput = document.getElementById('spotify-url-input');

  async function handlePasteToSearch() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        urlInput.focus();
        showToast('Link pasted from clipboard', 'info');
      }
    } catch {
      urlInput.focus();
    }
  }

  pasteBtn?.addEventListener('click', handlePasteToSearch);
  pasteHeaderBtn?.addEventListener('click', handlePasteToSearch);

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
      // Album, Artist Top Tracks or Playlist
      const isAlbum = data.type === 'album';
      const isArtist = data.type === 'artist';
      const typeLabel = isAlbum ? 'Album' : (isArtist ? 'Artist (Top Tracks)' : 'Playlist');
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
            <span class="preview-tag">${typeLabel}</span>
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
      const doneCount = jobs.filter(j => j.status === 'done').length;
      const downloadsStatsLine = document.getElementById('downloads-stats-line');
      if (downloadsStatsLine) {
        if (jobs.length === 0) {
          downloadsStatsLine.textContent = 'Active & recent queue · 0 active downloads';
        } else {
          downloadsStatsLine.textContent = `${activeCount} active · ${doneCount} completed · ${jobs.length} total in queue`;
        }
      }

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

  const btnLibRefresh = document.getElementById('btn-lib-refresh');

  // Bulk Selection & Editing Elements
  const chkSelectAll = document.getElementById('chk-select-all');
  const bulkBar = document.getElementById('library-bulk-bar');
  const bulkCount = document.getElementById('bulk-selected-count');
  const btnBulkEdit = document.getElementById('btn-bulk-edit');
  const btnBulkDelete = document.getElementById('btn-bulk-delete');
  const btnBulkClear = document.getElementById('btn-bulk-clear');

  const modalBulkEdit = document.getElementById('modal-bulk-edit');
  const formBulkEdit = document.getElementById('form-bulk-edit');
  const bulkEditSubtitle = document.getElementById('bulk-edit-subtitle');
  const btnCloseBulkModal = document.getElementById('btn-close-bulk-modal');
  const btnCancelBulkModal = document.getElementById('btn-cancel-bulk-modal');
  const btnSaveBulkModal = document.getElementById('btn-save-bulk-modal');
  const bulkModalFeedback = document.getElementById('bulk-modal-feedback');

  const selectedTrackIds = new Set();

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

  audioPlayer.addEventListener('error', (e) => {
    console.warn('Audio playback error:', e);
    updatePlaybackUI(false);
    if (currentPlayingTrack) {
      const title = currentPlayingTrack.title || 'this track';
      console.error(`Unable to stream track "${title}".`);
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

  // Skeleton Loading Placeholders
  function renderSkeletonTable() {
    if (!libraryTbody) return;
    libraryTbody.innerHTML = Array.from({ length: 6 }).map(() => `
      <tr class="skeleton-row">
        <td style="text-align: center;"><div class="skeleton-box" style="width: 16px; height: 16px;"></div></td>
        <td style="text-align: center;"><div class="skeleton-box" style="width: 14px; height: 14px;"></div></td>
        <td>
          <div style="display: flex; gap: 10px; align-items: center;">
            <div class="skeleton-box" style="width: 40px; height: 40px; border-radius: 4px; flex-shrink: 0;"></div>
            <div style="display: flex; flex-direction: column; gap: 6px; width: 100%;">
              <div class="skeleton-box" style="width: 65%; height: 14px;"></div>
              <div class="skeleton-box" style="width: 40%; height: 12px;"></div>
            </div>
          </div>
        </td>
        <td><div class="skeleton-box" style="width: 60%; height: 14px;"></div></td>
        <td style="text-align: center;"><div class="skeleton-box" style="width: 36px; height: 18px; border-radius: 4px;"></div></td>
        <td><div class="skeleton-box" style="width: 60px; height: 13px;"></div></td>
        <td><div class="skeleton-box" style="width: 50px; height: 13px;"></div></td>
        <td style="text-align: right;"><div class="skeleton-box" style="width: 36px; height: 13px;"></div></td>
        <td style="text-align: center;"><div class="skeleton-box" style="width: 20px; height: 20px; border-radius: 50%;"></div></td>
      </tr>
    `).join('');
  }

  function renderSkeletonGrid() {
    if (!libraryGridView) return;
    libraryGridView.innerHTML = Array.from({ length: 8 }).map(() => `
      <div class="skeleton-card">
        <div class="skeleton-box" style="width: 100%; aspect-ratio: 1/1; border-radius: 6px;"></div>
        <div class="skeleton-box" style="width: 75%; height: 15px; margin-top: 4px;"></div>
        <div class="skeleton-box" style="width: 45%; height: 12px;"></div>
      </div>
    `).join('');
  }

  // Library Data & Rendering
  async function loadLibrary(bypassCache = false) {
    if (currentSubtab === 'tracks' || currentViewMode === 'list') {
      if (libraryGridView) libraryGridView.style.display = 'none';
      if (libraryListView) libraryListView.style.display = 'block';
      renderSkeletonTable();
    } else {
      if (libraryListView) libraryListView.style.display = 'none';
      if (libraryGridView) libraryGridView.style.display = 'grid';
      renderSkeletonGrid();
    }

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
      list.sort((a, b) => {
        const dateB = new Date((b.downloaded_at || '').replace(' ', 'T') || 0).getTime() || 0;
        const dateA = new Date((a.downloaded_at || '').replace(' ', 'T') || 0).getTime() || 0;
        return dateB - dateA;
      });
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

  function updateBulkBarUI(tracks) {
    const list = tracks || getFilteredAndSortedTracks();
    const count = selectedTrackIds.size;
    if (bulkBar) {
      bulkBar.style.display = count > 0 ? 'flex' : 'none';
    }
    if (bulkCount) {
      bulkCount.textContent = `${count} track${count === 1 ? '' : 's'} selected`;
    }

    if (chkSelectAll) {
      if (!list || !list.length) {
        chkSelectAll.checked = false;
        chkSelectAll.indeterminate = false;
      } else {
        const allSelected = list.every(t => selectedTrackIds.has(t.id));
        const someSelected = list.some(t => selectedTrackIds.has(t.id));
        chkSelectAll.checked = allSelected;
        chkSelectAll.indeterminate = !allSelected && someSelected;
      }
    }
  }

  // 2. SPOTIFY TRACK TABLE VIEW (Image 1)
  function renderTableView(tracks) {
    if (!tracks || tracks.length === 0) {
      libraryTbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 3rem; color: var(--text-dim);">No matching tracks in your library.</td></tr>';
      updateBulkBarUI(tracks);
      return;
    }

    libraryTbody.innerHTML = tracks.map((t, idx) => {
      const isCurrent = currentPlayingTrack && currentPlayingTrack.id === t.id;
      const isPlaying = isCurrent && !audioPlayer.paused;
      const isChecked = selectedTrackIds.has(t.id);
      const addedText = timeAgo(t.downloaded_at);
      const releaseDate = t.year || (t.downloaded_at ? t.downloaded_at.slice(0, 10) : '-');
      const fmt = (t.format || 'mp3').toUpperCase();
      const coverUrl = `/api/cover?id=${t.id}`;

      return `
        <tr class="spotify-track-row ${isCurrent ? 'is-active' : ''} ${isPlaying ? 'is-playing' : ''}" data-id="${t.id}">
          <td class="col-check" style="text-align: center;">
            <input type="checkbox" class="sp-checkbox sp-track-chk" data-id="${t.id}" ${isChecked ? 'checked' : ''} title="Select track">
          </td>
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
              <button type="button" class="btn-track-menu" data-id="${t.id}" title="Track options">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="12" r="2.2"></circle><circle cx="19" cy="12" r="2.2"></circle><circle cx="5" cy="12" r="2.2"></circle></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row checkbox events
    libraryTbody.querySelectorAll('.sp-track-chk').forEach(chk => {
      chk.addEventListener('click', (e) => e.stopPropagation());
      chk.addEventListener('change', () => {
        const id = parseInt(chk.dataset.id, 10);
        if (chk.checked) {
          selectedTrackIds.add(id);
        } else {
          selectedTrackIds.delete(id);
        }
        updateBulkBarUI(tracks);
      });
    });

    updateBulkBarUI(tracks);

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

      // Right click opens contextual menu for that track
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const id = parseInt(row.dataset.id, 10);
        const btn = row.querySelector('.btn-track-menu');
        openContextMenu(e, id, btn);
      });
    });

    // Context menu button click
    libraryTbody.querySelectorAll('.btn-track-menu').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(btn.dataset.id, 10);
        openContextMenu(e, id, btn);
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

  // Context Menu & Edit Metadata Modal Elements
  const trackContextMenu = document.getElementById('track-context-menu');
  const ctxBtnPlay = document.getElementById('ctx-btn-play');
  const ctxBtnEdit = document.getElementById('ctx-btn-edit');
  const ctxBtnDelete = document.getElementById('ctx-btn-delete');

  const modalEditMetadata = document.getElementById('modal-edit-metadata');
  const formEditMetadata = document.getElementById('form-edit-metadata');
  const editTrackId = document.getElementById('edit-track-id');
  const editTrackTitle = document.getElementById('edit-track-title');
  const editTrackArtist = document.getElementById('edit-track-artist');
  const editTrackAlbum = document.getElementById('edit-track-album');
  const editTrackYear = document.getElementById('edit-track-year');
  const editTrackGenre = document.getElementById('edit-track-genre');
  const editCoverPreview = document.getElementById('edit-cover-preview');
  const editModalFeedback = document.getElementById('edit-modal-feedback');
  const btnCloseEditModal = document.getElementById('btn-close-edit-modal');
  const btnCancelEditModal = document.getElementById('btn-cancel-edit-modal');
  const btnSaveEditModal = document.getElementById('btn-save-edit-modal');

  let activeContextTrackId = null;
  let activeContextTriggerBtn = null;

  function hideContextMenu() {
    if (trackContextMenu) trackContextMenu.style.display = 'none';
    if (activeContextTriggerBtn) {
      activeContextTriggerBtn.classList.remove('is-open');
      activeContextTriggerBtn = null;
    }
  }

  function openContextMenu(e, trackId, triggerBtn) {
    e.stopPropagation();
    hideContextMenu();
    activeContextTrackId = trackId;
    activeContextTriggerBtn = triggerBtn;
    if (triggerBtn) triggerBtn.classList.add('is-open');

    if (!trackContextMenu) return;
    trackContextMenu.style.display = 'flex';

    // Calculate position
    const rect = triggerBtn ? triggerBtn.getBoundingClientRect() : { right: e.clientX, bottom: e.clientY, top: e.clientY };
    const menuWidth = 180;
    const menuHeight = trackContextMenu.offsetHeight || 135;

    let left = rect.right - menuWidth;
    if (left < 10) left = 10;
    if (left + menuWidth > window.innerWidth - 10) left = window.innerWidth - menuWidth - 10;

    let top = rect.bottom + 6;
    if (top + menuHeight > window.innerHeight - 10) {
      top = rect.top - menuHeight - 6;
    }

    trackContextMenu.style.left = `${left}px`;
    trackContextMenu.style.top = `${top}px`;
  }

  function openEditModal(track) {
    if (!track || !modalEditMetadata) return;
    if (editTrackId) editTrackId.value = track.id;
    if (editTrackTitle) editTrackTitle.value = track.title || '';
    if (editTrackArtist) editTrackArtist.value = track.artist || '';
    if (editTrackAlbum) editTrackAlbum.value = track.album || '';
    if (editTrackYear) editTrackYear.value = track.year || '';
    if (editTrackGenre) editTrackGenre.value = track.genre || '';
    if (editCoverPreview) editCoverPreview.src = `/api/cover?id=${track.id}`;
    if (editModalFeedback) editModalFeedback.style.display = 'none';

    modalEditMetadata.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => editTrackAlbum?.focus(), 60);
  }

  function closeEditModal() {
    if (modalEditMetadata) modalEditMetadata.style.display = 'none';
    document.body.style.overflow = '';
  }

  btnCloseEditModal?.addEventListener('click', closeEditModal);
  btnCancelEditModal?.addEventListener('click', closeEditModal);
  modalEditMetadata?.addEventListener('click', (e) => {
    if (e.target === modalEditMetadata) closeEditModal();
  });

  // Global listeners to close context menu
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#track-context-menu') && !e.target.closest('.btn-track-menu')) {
      hideContextMenu();
    }
  });

  window.addEventListener('scroll', hideContextMenu, { passive: true });
  window.addEventListener('resize', hideContextMenu);

  // Global Keyboard Shortcuts (Power User)
  document.addEventListener('keydown', (e) => {
    // 1. Always handle Escape to dismiss modals and menus
    if (e.key === 'Escape') {
      hideContextMenu();
      closeEditModal();
      closeBulkEditModal();
      return;
    }

    // 2. Ignore playback and search shortcuts if typing inside an editable field
    const activeEl = document.activeElement;
    const isTyping = activeEl && (
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) ||
      activeEl.isContentEditable
    );
    if (isTyping) return;

    // 3. Jump to search: "/" or "Ctrl+K" / "Cmd+K"
    if (e.key === '/' || ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K'))) {
      e.preventDefault();
      switchTab('search');
      setTimeout(() => document.getElementById('spotify-url-input')?.focus(), 50);
      return;
    }

    // 4. Play / Pause: Space
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
      return;
    }

    // 5. Seek backward / forward 5s: ArrowLeft / ArrowRight
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (audioPlayer && audioPlayer.duration) {
        audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5);
      }
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (audioPlayer && audioPlayer.duration) {
        audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 5);
      }
      return;
    }

    // 6. Volume Up / Down 5%: ArrowUp / ArrowDown
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newVol = Math.min(1, (audioPlayer.volume || 1) + 0.05);
      audioPlayer.volume = newVol;
      if (spPlayerVolumeFill) spPlayerVolumeFill.style.width = `${newVol * 100}%`;
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newVol = Math.max(0, (audioPlayer.volume || 1) - 0.05);
      audioPlayer.volume = newVol;
      if (spPlayerVolumeFill) spPlayerVolumeFill.style.width = `${newVol * 100}%`;
      return;
    }

    // 7. Toggle Mute: "M" or "m"
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      if (audioPlayer.volume > 0) {
        audioPlayer.dataset.lastVol = audioPlayer.volume;
        audioPlayer.volume = 0;
        if (spPlayerVolumeFill) spPlayerVolumeFill.style.width = '0%';
        showToast('Muted', 'info', 1500);
      } else {
        const restored = parseFloat(audioPlayer.dataset.lastVol || '0.8');
        audioPlayer.volume = restored;
        if (spPlayerVolumeFill) spPlayerVolumeFill.style.width = `${restored * 100}%`;
        showToast('Unmuted', 'info', 1500);
      }
      return;
    }
  });

  // Bulk selection controls & actions
  chkSelectAll?.addEventListener('change', () => {
    const list = getFilteredAndSortedTracks();
    if (chkSelectAll.checked) {
      list.forEach(t => selectedTrackIds.add(t.id));
    } else {
      list.forEach(t => selectedTrackIds.delete(t.id));
    }
    renderTableView(list);
  });

  btnBulkClear?.addEventListener('click', () => {
    selectedTrackIds.clear();
    const list = getFilteredAndSortedTracks();
    renderTableView(list);
  });

  function openBulkEditModal() {
    if (!modalBulkEdit) return;
    if (bulkEditSubtitle) {
      bulkEditSubtitle.textContent = `Update metadata for ${selectedTrackIds.size} selected tracks`;
    }
    if (formBulkEdit) formBulkEdit.reset();
    if (bulkModalFeedback) bulkModalFeedback.style.display = 'none';
    modalBulkEdit.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('bulk-edit-album')?.focus(), 60);
  }

  function closeBulkEditModal() {
    if (modalBulkEdit) modalBulkEdit.style.display = 'none';
    document.body.style.overflow = '';
  }

  btnBulkEdit?.addEventListener('click', () => {
    if (selectedTrackIds.size === 0) return;
    openBulkEditModal();
  });

  btnCloseBulkModal?.addEventListener('click', closeBulkEditModal);
  btnCancelBulkModal?.addEventListener('click', closeBulkEditModal);
  modalBulkEdit?.addEventListener('click', (e) => {
    if (e.target === modalBulkEdit) closeBulkEditModal();
  });

  formBulkEdit?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (selectedTrackIds.size === 0) {
      closeBulkEditModal();
      return;
    }

    const album = (document.getElementById('bulk-edit-album')?.value || '').trim();
    const artist = (document.getElementById('bulk-edit-artist')?.value || '').trim();
    const year = (document.getElementById('bulk-edit-year')?.value || '').trim();
    const genre = (document.getElementById('bulk-edit-genre')?.value || '').trim();

    if (!album && !artist && !year && !genre) {
      if (bulkModalFeedback) {
        bulkModalFeedback.textContent = 'Please fill at least one field to update.';
        bulkModalFeedback.style.color = 'var(--error)';
        bulkModalFeedback.style.display = 'block';
      }
      return;
    }

    if (btnSaveBulkModal) btnSaveBulkModal.disabled = true;
    const btnText = btnSaveBulkModal?.querySelector('.btn-text');
    const spinner = btnSaveBulkModal?.querySelector('.spinner');
    if (btnText) btnText.style.display = 'none';
    if (spinner) spinner.style.display = 'inline-block';

    const payload = { ids: Array.from(selectedTrackIds) };
    if (album) payload.album = album;
    if (artist) payload.artist = artist;
    if (year) payload.year = year;
    if (genre) payload.genre = genre;

    try {
      const res = await fetch('/api/library/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        closeBulkEditModal();
        showToast(`Updated metadata for ${data.updated || selectedTrackIds.size} tracks`, 'success');
        selectedTrackIds.clear();
        await loadLibrary(true);
      } else {
        if (bulkModalFeedback) {
          bulkModalFeedback.textContent = data.message || 'Error updating metadata.';
          bulkModalFeedback.style.color = 'var(--error)';
          bulkModalFeedback.style.display = 'block';
        }
      }
    } catch (err) {
      if (bulkModalFeedback) {
        bulkModalFeedback.textContent = 'Network error: ' + err.message;
        bulkModalFeedback.style.color = 'var(--error)';
        bulkModalFeedback.style.display = 'block';
      }
    } finally {
      if (btnSaveBulkModal) btnSaveBulkModal.disabled = false;
      if (btnText) btnText.style.display = 'inline';
      if (spinner) spinner.style.display = 'none';
    }
  });

  // Bulk Delete
  btnBulkDelete?.addEventListener('click', async () => {
    const count = selectedTrackIds.size;
    if (count === 0) return;
    const msg = `Are you sure you want to delete ${count} selected tracks?\n\n• Audio files will be deleted from disk\n• Tracks will be removed from your database and Navidrome`;
    if (!confirm(msg)) return;

    btnBulkDelete.disabled = true;
    try {
      const res = await fetch('/api/library/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedTrackIds) })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Successfully deleted ${data.deleted || count} tracks`, 'success');
        if (currentPlayingTrack && selectedTrackIds.has(currentPlayingTrack.id)) {
          audioPlayer.pause();
          if (spotifyPlayerBar) spotifyPlayerBar.style.display = 'none';
          document.body.classList.remove('has-active-player');
          currentPlayingTrack = null;
        }
        selectedTrackIds.clear();
        await loadLibrary(true);
      } else {
        showToast(data.message || 'Error deleting tracks', 'error');
      }
    } catch (err) {
      showToast('Network error while deleting: ' + err.message, 'error');
    } finally {
      btnBulkDelete.disabled = false;
    }
  });

  // Context Menu Actions: Play, Edit, Delete
  ctxBtnPlay?.addEventListener('click', () => {
    if (!activeContextTrackId) return;
    const tr = libraryTracks.find(t => t.id === activeContextTrackId);
    hideContextMenu();
    if (tr) playTrack(tr);
  });

  ctxBtnEdit?.addEventListener('click', () => {
    if (!activeContextTrackId) return;
    const tr = libraryTracks.find(t => t.id === activeContextTrackId);
    hideContextMenu();
    if (tr) openEditModal(tr);
  });

  ctxBtnDelete?.addEventListener('click', () => {
    if (!activeContextTrackId) return;
    const id = activeContextTrackId;
    const tr = libraryTracks.find(t => t.id === id);
    hideContextMenu();
    if (tr) deleteTrackAction(tr);
  });

  async function deleteTrackAction(track) {
    const id = track.id;
    const title = track.title || 'this track';
    const artist = track.artist || '';
    const msg = `Are you sure you want to delete "${title}${artist ? ' - ' + artist : ''}"?\n\n• The audio file will be deleted from disk\n• The track will be removed from your database and Navidrome`;
    if (!confirm(msg)) return;

    if (currentPlayingTrack && currentPlayingTrack.id === id) {
      audioPlayer.pause();
      spotifyPlayerBar.style.display = 'none';
      document.body.classList.remove('has-active-player');
      currentPlayingTrack = null;
    }

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
        showToast(`Track "${title}" deleted`, 'success');
      } else {
        showToast(data.message || 'Error deleting track', 'error');
      }
    } catch (err) {
      showToast('Network error while deleting track: ' + err.message, 'error');
    }
  }

  formEditMetadata?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(editTrackId?.value || '0', 10);
    const title = (editTrackTitle?.value || '').trim();
    const artist = (editTrackArtist?.value || '').trim();
    const album = (editTrackAlbum?.value || '').trim();
    const year = (editTrackYear?.value || '').trim();
    const genre = (editTrackGenre?.value || '').trim();

    if (!id || !title || !artist) {
      showEditModalFeedback('Title and Artist are required.', 'error');
      return;
    }

    if (btnSaveEditModal) btnSaveEditModal.disabled = true;
    const btnText = btnSaveEditModal?.querySelector('.btn-text');
    const spinner = btnSaveEditModal?.querySelector('.spinner');
    if (btnText) btnText.style.display = 'none';
    if (spinner) spinner.style.display = 'inline-block';

    try {
      const res = await fetch('/api/track/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title, artist, album, year, genre })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const tr = libraryTracks.find(t => t.id === id);
        if (tr) {
          tr.title = title;
          tr.artist = artist;
          tr.album = album;
          tr.year = year;
          tr.genre = genre;
        }

        if (currentPlayingTrack && currentPlayingTrack.id === id) {
          currentPlayingTrack.title = title;
          currentPlayingTrack.artist = artist;
          currentPlayingTrack.album = album;
          if (spPlayerTitle) spPlayerTitle.textContent = title;
          if (spPlayerArtist) spPlayerArtist.textContent = `${artist}${album ? ' · ' + album : ''}`;
        }

        updateLibraryStats();
        renderCurrentLibraryView();
        closeEditModal();
        showToast(`Metadata updated for "${title}"`, 'success');
      } else {
        showEditModalFeedback(data.message || 'Error updating metadata.', 'error');
      }
    } catch (err) {
      showEditModalFeedback('Network error: ' + err.message, 'error');
    } finally {
      if (btnSaveEditModal) btnSaveEditModal.disabled = false;
      if (btnText) btnText.style.display = 'inline';
      if (spinner) spinner.style.display = 'none';
    }
  });

  function showEditModalFeedback(msg, type) {
    if (!editModalFeedback) return;
    editModalFeedback.textContent = msg;
    editModalFeedback.style.color = type === 'success' ? 'var(--accent-primary)' : 'var(--error)';
    editModalFeedback.style.display = 'block';
  }

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

  // Modern Settings Sidebar Pane Switcher
  const settingsNavItems = document.querySelectorAll('.settings-nav-item');
  const settingsPanes = document.querySelectorAll('.settings-pane-section');
  const btnSaveSettingsMain = document.getElementById('btn-save-settings-main');
  const configurablePanes = ['pane-storage-formats', 'pane-navidrome'];

  function switchSettingsPane(targetPaneId) {
    if (!targetPaneId) return;
    settingsNavItems.forEach(n => {
      const isMatch = n.dataset.pane === targetPaneId;
      n.classList.toggle('active', isMatch);
      n.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });
    settingsPanes.forEach(pane => {
      pane.classList.toggle('active', pane.id === targetPaneId);
    });

    // Only show "Save Settings" button on panes that actually save system settings
    if (btnSaveSettingsMain) {
      btnSaveSettingsMain.style.display = configurablePanes.includes(targetPaneId) ? 'inline-flex' : 'none';
    }
    if (saveStatus) {
      saveStatus.style.display = 'none';
    }

    if (targetPaneId === 'pane-disk') {
      loadStorageStats();
    }
  }

  settingsNavItems.forEach(item => {
    item.addEventListener('click', () => {
      switchSettingsPane(item.dataset.pane);
    });
  });

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

  function renderStorageStats(storage) {
    if (!storage) return;
    const usedFmt = storage.used_formatted || '--';
    const totalFmt = storage.total_formatted || '--';
    const freeFmt = storage.free_formatted || '--';
    const pct = storage.percent ?? 0;

    const storageVal = document.getElementById('home-stat-storage');
    const storageSub = document.getElementById('home-stat-storage-sub');
    const storageFill = document.getElementById('home-storage-fill');

    if (storageVal) storageVal.textContent = `${usedFmt} / ${totalFmt}`;
    if (storageSub) storageSub.textContent = `Free: ${freeFmt} (${pct}% used)`;
    if (storageFill) {
      storageFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      storageFill.classList.toggle('warn', pct >= 80 && pct < 90);
      storageFill.classList.toggle('danger', pct >= 90);
    }
  }

  async function loadStorageStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data && data.stats && data.stats.storage) {
        renderStorageStats(data.stats.storage);
      }
    } catch (e) {
      console.warn('Failed to load storage telemetry:', e);
    }
  }

  async function loadSettings() {
    loadStorageStats();
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
      showToast('Failed to save settings.', 'error');
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
