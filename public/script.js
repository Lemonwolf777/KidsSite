const categories = [
  {
    id: 'all', name: 'All Videos', emoji: '🌈',
    desc: 'Everything approved in one happy place',
    banner: 'Every approved video, all together.',
    scene: ['⭐','🌈','☁️','✨'],
    world: ['🌈','⭐','☁️','✨','🪁','🎈','🌟','🫧','🎨','🚀','💫','☀️']
  },
  {
    id: 'learn', name: 'Learn', emoji: '📚',
    desc: 'Colours, words, science and more',
    banner: 'Welcome to the discovery lab — learn something amazing!',
    scene: ['✏️','🔬','🧠','💡'],
    world: ['🔤','✏️','📏','🔬','🧪','💡','🔢','🖍️','🎒','📐','🧠','⭐']
  },
  {
    id: 'animals', name: 'Animals', emoji: '🐯',
    desc: 'Wild friends, pets and nature',
    banner: 'Step into the jungle and meet amazing animal friends.',
    scene: ['🌿','🦁','🐾','🦋'],
    world: ['🌴','🦁','🐒','🦋','🌿','🦜','🐾','🌺','🐘','☀️','🐯','🍃']
  },
  {
    id: 'cartoons', name: 'Cartoons', emoji: '🎨',
    desc: 'Funny, colourful animated adventures',
    banner: 'A bright cartoon world packed with laughs and adventures.',
    scene: ['🎈','⭐','🎭','✨'],
    world: ['💥','⭐','🎈','✨','🎨','☁️','⚡','🎭','🌈','💫','🎪','🫧']
  },
  {
    id: 'songs', name: 'Songs', emoji: '🎵',
    desc: 'Sing, dance and move along',
    banner: 'Turn up the fun — sing, dance and move to the music!',
    scene: ['🎤','🎶','💃','🪩'],
    world: ['🎵','🎤','🎶','🪩','🎧','⭐','🥁','🎹','🎸','💃','🎺','✨']
  },
  {
    id: 'stories', name: 'Stories', emoji: '📖',
    desc: 'Big adventures and bedtime tales',
    banner: 'Cosy story time under the moon and stars.',
    scene: ['🌙','🏰','⭐','🧸'],
    world: ['🌙','⭐','☁️','📚','🏰','🧸','✨','🚀','🦄','💤','🌟','🪄']
  },
  {
    id: 'math', name: 'Math', emoji: '🔢',
    desc: 'Numbers, counting and easy maths',
    banner: 'Count, solve and play in a world full of numbers.',
    scene: ['➕','🔷','7️⃣','🧩'],
    world: ['1️⃣','2️⃣','3️⃣','➕','➖','🔺','🟦','🧩','✖️','🟡','📐','🟩']
  }
];

const legacyLocalVideos = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem('kidssite_videos') || '[]');
    return Array.isArray(saved) ? saved.filter(v => v && v.id && v.title && v.category) : [];
  } catch (_) {
    return [];
  }
})();

let videos = [];
let currentCategory = 'all';
let adminPinSession = '';
let cloudOnline = false;
let timerMinutes = Number(localStorage.getItem('kidssite_timer') || 0);
let remainingSeconds = timerMinutes * 60;
let countdownId = null;
let viewingLocked = localStorage.getItem('kidssite_locked') === 'true';

const $ = (id) => document.getElementById(id);
const homeView = $('homeView');
const categoryView = $('categoryView');
const categoriesEl = $('categories');
const videoGrid = $('videoGrid');
const emptyState = $('emptyState');
const sectionTitle = $('sectionTitle');
const videoCount = $('videoCount');
const categoryBannerEmoji = $('categoryBannerEmoji');
const categoryBannerTitle = $('categoryBannerTitle');
const categoryBannerText = $('categoryBannerText');
const categoryScene = $('categoryScene');
const worldDecor = $('worldDecor');
const playerModal = $('playerModal');
const playerFrame = $('playerFrame');
let ytPlayer = null;
let ytApiReady = false;
let ytPlayerReady = false;
let pendingVideo = null;
let currentVideoId = null;
let justExitedPlayerFullscreen = false;
let fullscreenExitGuardTimer = null;
let homeGuardReturning = false;
let currentPlayingVideo = null;
let autoplayTimeout = null;
let watchPlayingSince = null;
let unreportedWatchSeconds = 0;
let watchHeartbeatId = null;
let watchDateForSession = '';
let statsRows = [];
const playerTitle = $('playerTitle');
const videoWrap = $('videoWrap');
const landscapeFullscreenBtn = $('landscapeFullscreenBtn');
const timerLabel = $('timerLabel');
const parentModal = $('parentModal');
const pinGate = $('pinGate');
const parentPanel = $('parentPanel');
const timeUpOverlay = $('timeUpOverlay');
const syncStatus = $('syncStatus');
const installBtn = $('installBtn');
const installHelpModal = $('installHelpModal');
let deferredInstallPrompt = null;


function cacheVideosLocally() {
  localStorage.setItem('kidssite_videos', JSON.stringify(videos));
}

function setSyncStatus(text, isError = false) {
  syncStatus.textContent = text;
  syncStatus.classList.toggle('error', isError);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (adminPinSession) headers.set('x-admin-pin', adminPinSession);
  return fetch(path, { ...options, headers, cache: 'no-store' });
}

async function loadVideos() {
  setSyncStatus('☁️ Syncing…');
  try {
    const response = await api('/api/videos');
    if (!response.ok) throw new Error('Cloud response failed');
    const data = await response.json();
    videos = Array.isArray(data.videos) ? data.videos : [];
    cloudOnline = true;
    cacheVideosLocally();
    setSyncStatus('☁️ Synced');
  } catch (error) {
    cloudOnline = false;
    videos = legacyLocalVideos.slice();
    setSyncStatus('⚠️ Offline copy', true);
  }
  renderCategories();
  renderVideos();
}

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0];
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const parts = u.pathname.split('/').filter(Boolean);
    const embedIndex = parts.indexOf('embed');
    const shortsIndex = parts.indexOf('shorts');
    if (embedIndex >= 0 && parts[embedIndex + 1]) return parts[embedIndex + 1];
    if (shortsIndex >= 0 && parts[shortsIndex + 1]) return parts[shortsIndex + 1];
  } catch (_) {}
  return null;
}

function categoryCount(categoryId) {
  return categoryId === 'all' ? videos.length : videos.filter(v => v.category === categoryId).length;
}

function renderCategories() {
  categoriesEl.innerHTML = '';
  categories.forEach(cat => {
    const count = categoryCount(cat.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-btn';
    btn.dataset.category = cat.id;
    btn.setAttribute('aria-label', `Open ${cat.name}, ${count} video${count === 1 ? '' : 's'}`);
    btn.innerHTML = `
      <span class="category-topline">
        <span class="category-emoji">${cat.emoji}</span>
        <span class="category-arrow">→</span>
      </span>
      <span class="category-name">${cat.name}</span>
      <span class="category-desc">${cat.desc}</span>`;
    btn.addEventListener('click', () => openCategory(cat.id));
    categoriesEl.appendChild(btn);
  });
}

function setKidsSiteHistory(view, extra = {}, { replace = false } = {}) {
  const state = { kidssite: true, view, ...extra };
  try {
    if (replace) {
      history.replaceState(state, '', window.location.href);
    } else {
      history.pushState(state, '', window.location.href);
    }
  } catch (_) {}
}

const HOME_GUARD_DEPTH = 24;

function initialiseKidsSiteHomeGuard() {
  try {
    // Build the protection BEFORE the child starts using the app.
    // This avoids relying on pushState after each Back press, which can be
    // too slow when Samsung/Android Back is pressed repeatedly while pinned.
    history.replaceState(
      { kidssite: true, view: 'home-guard', guardIndex: 0 },
      '',
      window.location.href
    );

    for (let i = 1; i < HOME_GUARD_DEPTH; i++) {
      history.pushState(
        { kidssite: true, view: 'home-guard', guardIndex: i },
        '',
        window.location.href
      );
    }

    history.pushState(
      { kidssite: true, view: 'home', guardIndex: HOME_GUARD_DEPTH },
      '',
      window.location.href
    );
  } catch (_) {}
}

function showProtectedHome() {
  delete document.body.dataset.category;
  categoryView.classList.add('hidden');
  homeView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function returnToProtectedHomeTop(state) {
  showProtectedHome();

  if (homeGuardReturning) return;
  homeGuardReturning = true;

  // If Back moved into one of the pre-built guard entries, jump straight
  // back to the protected Home entry. We use the stored guard index so
  // even multiple rapid Back presses can be recovered in one move.
  if (
    state &&
    state.kidssite &&
    state.view === 'home-guard' &&
    Number.isInteger(state.guardIndex)
  ) {
    const stepsForward = HOME_GUARD_DEPTH - state.guardIndex;
    if (stepsForward > 0) {
      try {
        history.go(stepsForward);
      } catch (_) {}
    }
  }

  setTimeout(() => {
    homeGuardReturning = false;
  }, 220);
}

function openCategory(categoryId, { pushHistory = true } = {}) {
  currentCategory = categories.some(c => c.id === categoryId) ? categoryId : 'all';
  document.body.dataset.category = currentCategory;
  renderVideos();
  homeView.classList.add('hidden');
  categoryView.classList.remove('hidden');
  if (pushHistory) {
    setKidsSiteHistory('category', { category: currentCategory });
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function showCategories({ fromHistory = false } = {}) {
  if (!fromHistory && history.state && history.state.kidssite && history.state.view !== 'home') {
    history.back();
    return;
  }

  delete document.body.dataset.category;
  categoryView.classList.add('hidden');
  homeView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: fromHistory ? 'instant' : 'smooth' });
}

function renderVideos() {
  const filtered = currentCategory === 'all' ? videos : videos.filter(v => v.category === currentCategory);
  const cat = categories.find(c => c.id === currentCategory) || categories[0];

  categoryView.dataset.category = cat.id;
  categoryBannerEmoji.textContent = cat.emoji;
  categoryBannerTitle.textContent = cat.name;
  categoryBannerText.textContent = cat.banner;
  categoryScene.innerHTML = (cat.scene || []).map(item => `<span>${item}</span>`).join('');
  worldDecor.innerHTML = (cat.world || []).map((item, index) =>
    `<span class="world-prop world-prop-${index + 1}">${item}</span>`
  ).join('');
  sectionTitle.textContent = currentCategory === 'all' ? 'Choose a video' : `${cat.name} videos`;
  videoCount.textContent = `${filtered.length} video${filtered.length === 1 ? '' : 's'}`;

  videoGrid.innerHTML = '';
  emptyState.classList.toggle('hidden', filtered.length > 0);

  filtered.forEach(video => {
    const catInfo = categories.find(c => c.id === video.category) || categories[0];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'video-card';
    card.innerHTML = `
      <div class="thumb-wrap">
        <img src="https://img.youtube.com/vi/${video.id}/hqdefault.jpg" alt="${escapeHtml(video.title)} thumbnail" loading="lazy" />
        <div class="play-badge">▶</div>
      </div>
      <div class="video-info">
        <strong>${escapeHtml(video.title)}</strong>
        <span>${catInfo.emoji} ${catInfo.name}</span>
      </div>`;
    card.addEventListener('click', () => openVideo(video));
    videoGrid.appendChild(card);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function loadYouTubeApi() {
  if (window.YT && window.YT.Player) {
    ytApiReady = true;
    return;
  }
  if (document.querySelector('script[data-kidssite-youtube-api]')) return;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.async = true;
  tag.dataset.kidssiteYoutubeApi = 'true';
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function() {
  ytApiReady = true;
  if (pendingVideo && !ytPlayer) {
    createYouTubePlayer(pendingVideo);
  }
};

function createYouTubePlayer(video) {
  if (!ytApiReady || !window.YT || !window.YT.Player) {
    pendingVideo = video;
    loadYouTubeApi();
    return;
  }

  pendingVideo = video;
  currentVideoId = video.id;

  ytPlayer = new YT.Player('playerFrame', {
    width: '100%',
    height: '100%',
    videoId: video.id,
    playerVars: {
      autoplay: 1,
      playsinline: 1,
      rel: 0,
      origin: window.location.origin
    },
    events: {
      onReady: event => {
        ytPlayerReady = true;
        if (pendingVideo && pendingVideo.id !== currentVideoId) {
          currentVideoId = pendingVideo.id;
          event.target.loadVideoById(pendingVideo.id);
        } else {
          event.target.playVideo();
        }
      },
      onAutoplayBlocked: event => {
        // Browser blocked playback with sound. Start muted automatically.
        try {
          event.target.mute();
          event.target.playVideo();
        } catch (_) {}
      },
      onStateChange: handlePlayerStateChange
    }
  });
}

function playVideoNow(video, options = {}) {
  finishWatchSegment();
  currentPlayingVideo = video;
  pendingVideo = video;
  currentVideoId = video.id;
  playerTitle.textContent = video.title;
  startWatchSession(video);

  if (ytPlayer && ytPlayerReady) {
    try {
      ytPlayer.unMute();
      ytPlayer.loadVideoById(video.id);
      ytPlayer.playVideo();
      return;
    } catch (_) {}
  }

  if (ytPlayer) return;
  createYouTubePlayer(video);
}

function openVideo(video) {
  if (viewingLocked) {
    timeUpOverlay.classList.remove('hidden');
    return;
  }

  playerTitle.textContent = video.title;

  // Show the player container first so the browser can fullscreen it.
  playerModal.classList.remove('hidden');
  playerModal.setAttribute('aria-hidden', 'false');

  // IMPORTANT: this runs directly from the child's card tap.
  // Request fullscreen immediately while the browser still considers
  // the tap a valid user gesture, then rotate to landscape.
  enterLandscapeFullscreen();

  // Start the selected video from the very same tap.
  playVideoNow(video);

  // Give Android/Samsung Back a real in-app destination.
  setKidsSiteHistory('video', { category: currentCategory, videoId: video.id });

  if (timerMinutes > 0 && !countdownId) startCountdown();
  updateTimerLabel();
}


function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startWatchSession(video) {
  watchDateForSession = localDateString();
  unreportedWatchSeconds = 0;
  watchPlayingSince = null;
  api('/api/watch/start', {
    method: 'POST',
    body: JSON.stringify({ id: video.id, date: watchDateForSession }),
    keepalive: true
  }).catch(() => {});
  if (watchHeartbeatId) clearInterval(watchHeartbeatId);
  watchHeartbeatId = setInterval(() => flushWatchTime(false), 30000);
}

function finishWatchSegment() {
  if (watchPlayingSince) {
    unreportedWatchSeconds += Math.max(0, (Date.now() - watchPlayingSince) / 1000);
    watchPlayingSince = null;
  }
}

function flushWatchTime(force = false) {
  if (!currentPlayingVideo) return;
  if (watchPlayingSince) {
    unreportedWatchSeconds += Math.max(0, (Date.now() - watchPlayingSince) / 1000);
    watchPlayingSince = Date.now();
  }
  const seconds = Math.floor(unreportedWatchSeconds);
  if (seconds < (force ? 1 : 10)) return;
  unreportedWatchSeconds -= seconds;
  api('/api/watch/time', {
    method: 'POST',
    body: JSON.stringify({ id: currentPlayingVideo.id, date: watchDateForSession || localDateString(), seconds }),
    keepalive: true
  }).catch(() => {});
}

function finishWatchSession() {
  finishWatchSegment();
  flushWatchTime(true);
  if (watchHeartbeatId) {
    clearInterval(watchHeartbeatId);
    watchHeartbeatId = null;
  }
  watchPlayingSince = null;
  unreportedWatchSeconds = 0;
}

function handlePlayerStateChange(event) {
  if (!window.YT || !YT.PlayerState) return;
  if (event.data === YT.PlayerState.PLAYING) {
    if (!watchPlayingSince) watchPlayingSince = Date.now();
    return;
  }

  if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.BUFFERING || event.data === YT.PlayerState.CUED) {
    finishWatchSegment();
    flushWatchTime(false);
    return;
  }

  if (event.data === YT.PlayerState.ENDED) {
    finishWatchSession();
    autoPlayNextApproved();
  }
}

function autoPlayNextApproved() {
  if (!currentPlayingVideo || viewingLocked || playerModal.classList.contains('hidden')) return;
  const sameCategory = videos.filter(v => v.category === currentPlayingVideo.category);
  if (sameCategory.length < 2) return;
  const index = sameCategory.findIndex(v => v.id === currentPlayingVideo.id);
  const nextVideo = sameCategory[(index + 1 + sameCategory.length) % sameCategory.length];
  if (!nextVideo) return;

  playerTitle.textContent = `Up next: ${nextVideo.title}`;
  autoplayTimeout = setTimeout(() => {
    autoplayTimeout = null;
    if (viewingLocked || playerModal.classList.contains('hidden')) return;
    playVideoNow(nextVideo, { autoplay: true });
  }, 850);
}

async function lockLandscape() {
  try {
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      await screen.orientation.lock('landscape');
    }
  } catch (_) {
    // Some browsers do not allow orientation locking.
  }
}

function unlockOrientation() {
  try {
    if (screen.orientation && typeof screen.orientation.unlock === 'function') {
      screen.orientation.unlock();
    }
  } catch (_) {}
}

async function enterLandscapeFullscreen() {
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (videoWrap.requestFullscreen) {
        try {
          await videoWrap.requestFullscreen({ navigationUI: 'hide' });
        } catch (_) {
          await videoWrap.requestFullscreen();
        }
      } else if (videoWrap.webkitRequestFullscreen) {
        videoWrap.webkitRequestFullscreen();
      }
    }
    await lockLandscape();
  } catch (_) {}
}

function handleFullscreenChange() {
  const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;

  if (fullscreenElement && !playerModal.classList.contains('hidden')) {
    justExitedPlayerFullscreen = false;
    if (fullscreenExitGuardTimer) {
      clearTimeout(fullscreenExitGuardTimer);
      fullscreenExitGuardTimer = null;
    }
    setTimeout(lockLandscape, 50);
    return;
  }

  unlockOrientation();

  // FIRST Android/Samsung Back while a video is fullscreen:
  // leave fullscreen only and keep the same video/player screen open.
  if (!playerModal.classList.contains('hidden')) {
    justExitedPlayerFullscreen = true;

    if (fullscreenExitGuardTimer) clearTimeout(fullscreenExitGuardTimer);
    fullscreenExitGuardTimer = setTimeout(() => {
      justExitedPlayerFullscreen = false;
      fullscreenExitGuardTimer = null;
    }, 900);
  }
}

function closeVideo() {
  if (autoplayTimeout) {
    clearTimeout(autoplayTimeout);
    autoplayTimeout = null;
  }
  finishWatchSession();
  currentPlayingVideo = null;
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
  unlockOrientation();
  pendingVideo = null;
  if (ytPlayer && ytPlayerReady) {
    try { ytPlayer.stopVideo(); } catch (_) {}
  }
  playerModal.classList.add('hidden');
  playerModal.setAttribute('aria-hidden', 'true');
}

function leaveVideo() {
  if (history.state && history.state.kidssite && history.state.view === 'video') {
    history.back();
  } else {
    closeVideo();
  }
}

function goHomeFromPlayer() {
  closeVideo();

  // A video opened from a category normally has:
  // home -> category -> video. Go back two entries to Home.
  if (history.state && history.state.kidssite && history.state.view === 'video') {
    history.go(-2);
  } else {
    showCategories({ fromHistory: true });
  }
}

function startCountdown() {
  if (timerMinutes <= 0 || viewingLocked) return;
  if (remainingSeconds <= 0) remainingSeconds = timerMinutes * 60;
  countdownId = setInterval(() => {
    remainingSeconds -= 1;
    updateTimerLabel();
    if (remainingSeconds <= 0) {
      clearInterval(countdownId);
      countdownId = null;
      viewingLocked = true;
      localStorage.setItem('kidssite_locked', 'true');
      closeVideo();
      timeUpOverlay.classList.remove('hidden');
    }
  }, 1000);
}

function updateTimerLabel() {
  if (timerMinutes <= 0) {
    timerLabel.textContent = '⏱️ Timer: Off';
    return;
  }
  const mins = Math.floor(Math.max(0, remainingSeconds) / 60);
  const secs = Math.max(0, remainingSeconds) % 60;
  timerLabel.textContent = `⏱️ ${mins}:${String(secs).padStart(2, '0')} remaining`;
}

function openParentModal() {
  if (!parentModal.classList.contains('hidden')) return;

  // Remember Parent Mode as an in-app screen. This gives the
  // Samsung/Android Back button somewhere to return to.
  setKidsSiteHistory('parent', {
    returnView: history.state && history.state.kidssite ? history.state.view : 'home',
    returnCategory: currentCategory
  });

  parentModal.classList.remove('hidden');
  parentModal.setAttribute('aria-hidden', 'false');
  $('pinInput').value = '';
  $('pinStatus').textContent = '';
  pinGate.classList.remove('hidden');
  parentPanel.classList.add('hidden');
  setTimeout(() => $('pinInput').focus(), 100);
}

function hideParentModal() {
  parentModal.classList.add('hidden');
  parentModal.setAttribute('aria-hidden', 'true');
}

function closeParentModal() {
  // The X button / outside tap should behave exactly like Android Back.
  if (
    !parentModal.classList.contains('hidden') &&
    history.state &&
    history.state.kidssite &&
    history.state.view === 'parent'
  ) {
    history.back();
    return;
  }

  hideParentModal();
}

async function unlockParent() {
  const pin = $('pinInput').value.trim();
  const status = $('pinStatus');
  if (!pin) {
    status.textContent = 'Enter your parent PIN.';
    return;
  }

  status.textContent = 'Checking…';
  try {
    adminPinSession = pin;
    const response = await api('/api/auth', { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      adminPinSession = '';
      status.textContent = data.error || 'Could not unlock Parent Mode.';
      return;
    }

    pinGate.classList.add('hidden');
    parentPanel.classList.remove('hidden');
    viewingLocked = false;
    localStorage.setItem('kidssite_locked', 'false');
    timeUpOverlay.classList.add('hidden');
    if (timerMinutes > 0) remainingSeconds = timerMinutes * 60;
    renderManageList();
    renderTimerOptions();
    renderImportOption();
    loadDashboard();
  } catch (_) {
    adminPinSession = '';
    status.textContent = 'Cloud connection failed. Try again.';
  }
}

async function addVideo() {
  const title = $('videoTitleInput').value.trim();
  const url = $('videoUrlInput').value.trim();
  const category = $('videoCategoryInput').value;
  const id = extractYouTubeId(url);
  const msg = $('addMessage');

  if (!title || !id) {
    msg.textContent = 'Please enter a title and a valid YouTube link.';
    return;
  }
  if (!cloudOnline) {
    msg.textContent = 'Cloud sync is offline. Try again when ☁️ Synced appears.';
    return;
  }

  msg.textContent = 'Saving to cloud…';
  try {
    const response = await api('/api/videos', {
      method: 'POST',
      body: JSON.stringify({ id, title, category })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      msg.textContent = data.error || 'Could not add the video.';
      return;
    }
    videos = Array.isArray(data.videos) ? data.videos : videos;
    cacheVideosLocally();
    $('videoTitleInput').value = '';
    $('videoUrlInput').value = '';
    msg.textContent = '✅ Added and synced to every device.';
    renderCategories();
    renderVideos();
    renderManageList();
    setTimeout(() => msg.textContent = '', 3000);
  } catch (_) {
    msg.textContent = 'Cloud connection failed. Try again.';
  }
}

function renderManageList() {
  const list = $('manageList');
  list.innerHTML = '';
  if (videos.length === 0) {
    list.innerHTML = '<p class="small-note">No videos approved yet.</p>';
    return;
  }
  videos.forEach(video => {
    const row = document.createElement('div');
    row.className = 'manage-row';
    row.innerHTML = `<span>${escapeHtml(video.title)}</span><button>Remove</button>`;
    row.querySelector('button').addEventListener('click', async () => {
      if (!confirm(`Remove "${video.title}" from every device?`)) return;
      try {
        const response = await api(`/api/videos/${encodeURIComponent(video.id)}`, { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          alert(data.error || 'Could not remove the video.');
          return;
        }
        videos = videos.filter(v => v.id !== video.id);
        cacheVideosLocally();
        renderManageList();
        renderCategories();
        renderVideos();
      } catch (_) {
        alert('Cloud connection failed. Try again.');
      }
    });
    list.appendChild(row);
  });
}

function renderImportOption() {
  const block = $('importBlock');
  if (!legacyLocalVideos.length) {
    block.classList.add('hidden');
    return;
  }
  block.classList.remove('hidden');
  $('importText').textContent = `${legacyLocalVideos.length} video${legacyLocalVideos.length === 1 ? '' : 's'} were found in this browser from your old KidsSite. Import them once and they will appear on your phone and tablet too.`;
}

async function importLegacyVideos() {
  const msg = $('importMessage');
  if (!legacyLocalVideos.length) return;
  msg.textContent = 'Importing to cloud…';
  try {
    const response = await api('/api/videos/import', {
      method: 'POST',
      body: JSON.stringify({ videos: legacyLocalVideos })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      msg.textContent = data.error || 'Import failed.';
      return;
    }
    videos = Array.isArray(data.videos) ? data.videos : videos;
    legacyLocalVideos.length = 0;
    cacheVideosLocally();
    msg.textContent = `✅ Imported ${data.imported || 0} video(s).`;
    renderCategories();
    renderVideos();
    renderManageList();
    setTimeout(() => $('importBlock').classList.add('hidden'), 1200);
  } catch (_) {
    msg.textContent = 'Cloud connection failed. Try again.';
  }
}


function formatWatchTime(seconds) {
  seconds = Math.max(0, Number(seconds) || 0);
  if (seconds < 60) return seconds > 0 ? '<1 min' : '0 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function categoryLabel(categoryId) {
  const cat = categories.find(c => c.id === categoryId);
  return cat ? `${cat.emoji} ${cat.name}` : '—';
}

function getLastSevenDates() {
  const dates = [];
  const today = new Date();
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    dates.push({
      key: localDateString(d),
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      dateLabel: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    });
  }
  return dates;
}

async function loadDashboard() {
  const status = $('dashboardStatus');
  $('dashApproved').textContent = String(videos.length);
  status.textContent = 'Loading viewing activity…';

  const days = getLastSevenDates();
  try {
    const response = await api(`/api/stats?from=${encodeURIComponent(days[0].key)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      status.textContent = data.error || 'Could not load dashboard activity.';
      return;
    }
    statsRows = Array.isArray(data.rows) ? data.rows : [];
    renderDashboard(days, statsRows);
    status.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Activity syncs across devices.`;
  } catch (_) {
    status.textContent = 'Dashboard could not reach Cloudflare. Try Refresh.';
  }
}

function renderDashboard(days, rows) {
  const todayKey = localDateString();
  const todayRows = rows.filter(row => row.watch_date === todayKey);
  const todaySeconds = todayRows.reduce((sum, row) => sum + Number(row.seconds || 0), 0);
  const todayPlays = todayRows.reduce((sum, row) => sum + Number(row.plays || 0), 0);
  const weekSeconds = rows.reduce((sum, row) => sum + Number(row.seconds || 0), 0);

  $('dashTodayTime').textContent = formatWatchTime(todaySeconds);
  $('dashTodayPlays').textContent = String(todayPlays);
  $('dashWeekTime').textContent = `${formatWatchTime(weekSeconds)} total`;
  $('dashApproved').textContent = String(videos.length);

  const categoryTotals = new Map();
  const videoTotals = new Map();
  rows.forEach(row => {
    const plays = Number(row.plays || 0);
    const seconds = Number(row.seconds || 0);
    if (row.category && row.category !== 'other') {
      const current = categoryTotals.get(row.category) || { plays: 0, seconds: 0 };
      current.plays += plays;
      current.seconds += seconds;
      categoryTotals.set(row.category, current);
    }
    const currentVideo = videoTotals.get(row.id) || { title: row.title || 'Video', plays: 0, seconds: 0, category: row.category };
    currentVideo.plays += plays;
    currentVideo.seconds += seconds;
    videoTotals.set(row.id, currentVideo);
  });

  const topCategory = [...categoryTotals.entries()].sort((a, b) => (b[1].seconds - a[1].seconds) || (b[1].plays - a[1].plays))[0];
  $('dashTopCategory').textContent = topCategory ? categoryLabel(topCategory[0]) : '—';

  const topVideo = [...videoTotals.values()].sort((a, b) => (b.seconds - a.seconds) || (b.plays - a.plays))[0];
  $('dashTopVideo').textContent = topVideo ? topVideo.title : 'No viewing yet';
  $('dashTopVideoMeta').textContent = topVideo
    ? `${topVideo.plays} play${topVideo.plays === 1 ? '' : 's'} • ${formatWatchTime(topVideo.seconds)}`
    : 'Start watching to see activity.';

  const daily = new Map();
  rows.forEach(row => daily.set(row.watch_date, (daily.get(row.watch_date) || 0) + Number(row.seconds || 0)));
  const maxSeconds = Math.max(60, ...days.map(day => daily.get(day.key) || 0));
  const bars = $('activityBars');
  bars.innerHTML = '';
  days.forEach(day => {
    const seconds = daily.get(day.key) || 0;
    const item = document.createElement('div');
    item.className = 'activity-day';
    const height = seconds ? Math.max(10, Math.round((seconds / maxSeconds) * 100)) : 5;
    item.innerHTML = `<span class="activity-value">${seconds ? Math.max(1, Math.round(seconds / 60)) : 0}m</span><div class="activity-track"><span style="height:${height}%"></span></div><small>${day.label}<em>${day.dateLabel}</em></small>`;
    bars.appendChild(item);
  });
}


async function resetWatchHistory() {
  const status = $('dashboardStatus');
  const confirmed = window.confirm(
    'Reset all recorded watch history?\n\nThis will clear your testing watch time and 7-day activity. Approved videos will NOT be deleted.'
  );
  if (!confirmed) return;

  status.textContent = 'Resetting watch history…';
  $('resetStatsBtn').disabled = true;

  try {
    const response = await api('/api/stats/reset', { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      status.textContent = data.error || 'Could not reset watch history.';
      return;
    }

    statsRows = [];
    renderDashboard(getLastSevenDates(), []);
    status.textContent = '✅ Watch history reset. Today is back to 0 and the 7-day history is clear.';
  } catch (_) {
    status.textContent = 'Could not reach Cloudflare. Try again.';
  } finally {
    $('resetStatsBtn').disabled = false;
  }
}

function renderTimerOptions() {
  document.querySelectorAll('.timer-option').forEach(btn => {
    const mins = Number(btn.dataset.minutes);
    btn.classList.toggle('active', mins === timerMinutes);
  });
}

function setTimer(minutes) {
  timerMinutes = minutes;
  localStorage.setItem('kidssite_timer', String(minutes));
  remainingSeconds = minutes * 60;
  viewingLocked = false;
  localStorage.setItem('kidssite_locked', 'false');
  if (countdownId) {
    clearInterval(countdownId);
    countdownId = null;
  }
  renderTimerOptions();
  updateTimerLabel();
}

function populateCategorySelect() {
  const select = $('videoCategoryInput');
  select.innerHTML = '';
  categories.filter(c => c.id !== 'all').forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.emoji} ${cat.name}`;
    select.appendChild(opt);
  });
}


function isInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function showInstallHelp() {
  const text = $('installHelpText');
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    text.innerHTML = 'On iPhone/iPad: tap the <strong>Share</strong> button, then choose <strong>Add to Home Screen</strong>.';
  } else {
    text.innerHTML = 'Open your browser menu <strong>⋮</strong> and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.';
  }
  installHelpModal.classList.remove('hidden');
  installHelpModal.setAttribute('aria-hidden', 'false');
}

function closeInstallHelp() {
  installHelpModal.classList.add('hidden');
  installHelpModal.setAttribute('aria-hidden', 'true');
}

async function installKidsSite() {
  if (isInstalledApp()) return;
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } catch (_) {}
    deferredInstallPrompt = null;
    return;
  }
  showInstallHelp();
}

// ---------- Android / Samsung hardware Back navigation ----------
function handleKidsSitePopState(event) {
  const state = event.state;

  // STRONG PROTECTED HOME BOUNDARY:
  // All of these history entries are already created when KidsSite starts.
  // Back on All Categories therefore stays inside same-document history,
  // even if the child taps Back several times quickly while the app is pinned.
  if (state && state.kidssite && state.view === 'home-guard') {
    returnToProtectedHomeTop(state);
    return;
  }

  // Parent Dashboard / Parent PIN screen:
  // Back closes Parent Mode and reveals the exact KidsSite screen underneath.
  if (!parentModal.classList.contains('hidden')) {
    hideParentModal();
    return;
  }

  // Some Samsung/Android versions exit fullscreen AND fire browser Back
  // from the same button press. Restore the video history entry so that
  // the first Back still lands on the normal player screen.
  if (
    justExitedPlayerFullscreen &&
    !playerModal.classList.contains('hidden') &&
    (!state || state.view !== 'video')
  ) {
    justExitedPlayerFullscreen = false;
    if (fullscreenExitGuardTimer) {
      clearTimeout(fullscreenExitGuardTimer);
      fullscreenExitGuardTimer = null;
    }

    setKidsSiteHistory('video', {
      category: currentCategory,
      videoId: currentPlayingVideo ? currentPlayingVideo.id : currentVideoId
    });
    return;
  }

  // SECOND Back from the normal player screen:
  // close playback and return to the category list.
  if (!playerModal.classList.contains('hidden') && (!state || state.view !== 'video')) {
    closeVideo();
  }

  if (state && state.kidssite && state.view === 'category') {
    openCategory(state.category || 'all', { pushHistory: false });
    return;
  }

  if (state && state.kidssite && state.view === 'home') {
    showCategories({ fromHistory: true });
    return;
  }

  // Safety fallback: keep the child on All Categories.
  showProtectedHome();
}

window.addEventListener('popstate', handleKidsSitePopState);

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (!isInstalledApp()) installBtn.classList.add('ready');
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installBtn.classList.add('hidden');
  closeInstallHelp();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

installBtn.addEventListener('click', installKidsSite);
$('closeInstallHelp').addEventListener('click', closeInstallHelp);
installHelpModal.addEventListener('click', e => { if (e.target === installHelpModal) closeInstallHelp(); });
if (isInstalledApp()) installBtn.classList.add('hidden');
$('parentBtn').addEventListener('click', openParentModal);
$('closeParent').addEventListener('click', closeParentModal);
$('unlockBtn').addEventListener('click', unlockParent);
$('pinInput').addEventListener('keydown', e => { if (e.key === 'Enter') unlockParent(); });
$('addVideoBtn').addEventListener('click', addVideo);
$('importVideosBtn').addEventListener('click', importLegacyVideos);
$('refreshStatsBtn').addEventListener('click', loadDashboard);
$('resetStatsBtn').addEventListener('click', resetWatchHistory);
$('closePlayer').addEventListener('click', leaveVideo);
$('backCategories').addEventListener('click', showCategories);
$('emptyBackBtn').addEventListener('click', showCategories);
if (landscapeFullscreenBtn) landscapeFullscreenBtn.addEventListener('click', enterLandscapeFullscreen);
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
$('homeBtn').addEventListener('click', goHomeFromPlayer);
$('parentUnlockFromTimeUp').addEventListener('click', openParentModal);

document.querySelectorAll('.timer-option').forEach(btn => {
  btn.addEventListener('click', () => setTimer(Number(btn.dataset.minutes)));
});

playerModal.addEventListener('click', e => { if (e.target === playerModal) closeVideo(); });
window.addEventListener('pagehide', () => finishWatchSession());
parentModal.addEventListener('click', e => { if (e.target === parentModal) closeParentModal(); });

initialiseKidsSiteHomeGuard();
loadYouTubeApi();
populateCategorySelect();
renderCategories();
renderTimerOptions();
renderVideos();
loadVideos();
if (viewingLocked) timeUpOverlay.classList.remove('hidden');
