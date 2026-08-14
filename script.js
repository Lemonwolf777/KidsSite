const categories = [
  { id: 'all', name: 'All', emoji: '🌈' },
  { id: 'learn', name: 'Learn', emoji: '📚' },
  { id: 'animals', name: 'Animals', emoji: '🐯' },
  { id: 'cartoons', name: 'Cartoons', emoji: '🎨' },
  { id: 'songs', name: 'Songs', emoji: '🎵' },
  { id: 'stories', name: 'Stories', emoji: '📖' },
  { id: 'math', name: 'Math', emoji: '🔢' }
];

const starterVideos = [];
const MAX_VIDEO_VOLUME = 50;
const DEFAULT_VIDEO_VOLUME = 35;

let videos = JSON.parse(localStorage.getItem('kidssite_videos') || 'null') || starterVideos;
let currentCategory = 'all';
let parentPin = localStorage.getItem('kidssite_pin') || '1234';
let timerMinutes = Number(localStorage.getItem('kidssite_timer') || 0);
let remainingSeconds = timerMinutes * 60;
let countdownId = null;
let viewingLocked = localStorage.getItem('kidssite_locked') === 'true';
let player = null;
let playerReady = false;
let pendingVideo = null;
let isMuted = false;
let savedVolume = Math.min(
  MAX_VIDEO_VOLUME,
  Math.max(0, Number(localStorage.getItem('kidssite_volume') || DEFAULT_VIDEO_VOLUME))
);

const $ = (id) => document.getElementById(id);
const categoriesEl = $('categories');
const videoGrid = $('videoGrid');
const emptyState = $('emptyState');
const sectionTitle = $('sectionTitle');
const videoCount = $('videoCount');
const playerModal = $('playerModal');
const playerTitle = $('playerTitle');
const timerLabel = $('timerLabel');
const parentModal = $('parentModal');
const pinGate = $('pinGate');
const parentPanel = $('parentPanel');
const timeUpOverlay = $('timeUpOverlay');
const volumeSlider = $('volumeSlider');
const volumeValue = $('volumeValue');

function saveVideos() {
  localStorage.setItem('kidssite_videos', JSON.stringify(videos));
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

function renderCategories() {
  categoriesEl.innerHTML = '';
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-btn' + (cat.id === currentCategory ? ' active' : '');
    btn.innerHTML = `<span class="category-emoji">${cat.emoji}</span><span class="category-name">${cat.name}</span>`;
    btn.addEventListener('click', () => {
      currentCategory = cat.id;
      renderCategories();
      renderVideos();
    });
    categoriesEl.appendChild(btn);
  });
}

function renderVideos() {
  const filtered = currentCategory === 'all' ? videos : videos.filter(v => v.category === currentCategory);
  const cat = categories.find(c => c.id === currentCategory);
  sectionTitle.textContent = currentCategory === 'all' ? 'All Approved Videos' : `${cat.emoji} ${cat.name}`;
  videoCount.textContent = `${filtered.length} video${filtered.length === 1 ? '' : 's'}`;
  videoGrid.innerHTML = '';
  emptyState.classList.toggle('hidden', filtered.length > 0);

  filtered.forEach(video => {
    const catInfo = categories.find(c => c.id === video.category) || categories[0];
    const card = document.createElement('button');
    card.className = 'video-card';
    card.innerHTML = `
      <div class="thumb-wrap">
        <img src="https://img.youtube.com/vi/${video.id}/hqdefault.jpg" alt="${escapeHtml(video.title)} thumbnail" loading="lazy" />
        <div class="play-badge">▶️</div>
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

// --- KidsSite v1.3: robust YouTube player setup ---
let youtubeApiReady = !!(window.YT && window.YT.Player);
let playerInitStarted = false;
let currentVideo = null;
let playerLoadTimeout = null;

function setPlayerStatus(message, isError = false) {
  const el = $('playerStatus');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('error', !!isError);
  el.classList.toggle('hidden', !message);
}

function createYouTubePlayer() {
  if (player || playerInitStarted || !(window.YT && YT.Player)) return;
  playerInitStarted = true;
  setPlayerStatus('Loading video player…');

  const playerVars = {
    controls: 0,
    disablekb: 1,
    fs: 0,
    rel: 0,
    playsinline: 1,
    iv_load_policy: 3,
    autoplay: 0
  };

  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    playerVars.origin = window.location.origin;
  }

  try {
    player = new YT.Player('ytPlayer', {
      width: '100%',
      height: '100%',
      host: 'https://www.youtube-nocookie.com',
      playerVars,
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError
      }
    });
  } catch (err) {
    player = null;
    playerInitStarted = false;
    setPlayerStatus('The video player could not start. Refresh KidsSite and try again.', true);
  }
}

function ensureYouTubePlayer() {
  if (playerReady && player) return;

  if (window.YT && YT.Player) {
    youtubeApiReady = true;
    createYouTubePlayer();
    return;
  }

  setPlayerStatus('Loading video player…');
  clearTimeout(playerLoadTimeout);
  playerLoadTimeout = setTimeout(() => {
    if (!playerReady) {
      setPlayerStatus('YouTube is taking longer than expected. Check your internet, then refresh the page.', true);
    }
  }, 8000);
}

// YouTube calls this when its IFrame API finishes loading.
window.onYouTubeIframeAPIReady = function () {
  youtubeApiReady = true;
  if (currentVideo || pendingVideo) createYouTubePlayer();
};

function onPlayerReady() {
  clearTimeout(playerLoadTimeout);
  playerReady = true;
  playerInitStarted = false;
  enforceVolumeCap(savedVolume);
  updateVolumeUI(savedVolume);

  const videoToCue = pendingVideo || currentVideo;
  if (videoToCue) {
    cueApprovedVideo(videoToCue);
    pendingVideo = null;
  } else {
    setPlayerStatus('Choose an approved video.');
  }
}

function onPlayerError(event) {
  const code = event && event.data;
  if (code === 101 || code === 150) {
    setPlayerStatus('This video owner does not allow playback on other websites. Please choose another approved video.', true);
  } else {
    setPlayerStatus('This video could not be played here. Please try another approved video.', true);
  }
  $('playPauseBtn').innerHTML = '▶ <span>Play</span>';
}

function onPlayerStateChange(event) {
  if (!window.YT) return;
  if (event.data === YT.PlayerState.PLAYING) {
    $('playPauseBtn').innerHTML = '⏸ <span>Pause</span>';
    setPlayerStatus('');
    enforceVolumeCap();
  } else if (event.data === YT.PlayerState.CUED) {
    $('playPauseBtn').innerHTML = '▶ <span>Play</span>';
    setPlayerStatus('Ready — tap Play.');
  } else if (event.data === YT.PlayerState.PAUSED) {
    $('playPauseBtn').innerHTML = '▶ <span>Play</span>';
    setPlayerStatus('Paused');
  } else if (event.data === YT.PlayerState.ENDED) {
    $('playPauseBtn').innerHTML = '▶ <span>Play again</span>';
    setPlayerStatus('Finished');
  }
}

function openVideo(video) {
  if (viewingLocked) {
    timeUpOverlay.classList.remove('hidden');
    return;
  }

  currentVideo = video;
  pendingVideo = video;
  playerTitle.textContent = video.title;
  playerModal.classList.remove('hidden');
  playerModal.setAttribute('aria-hidden', 'false');
  $('playPauseBtn').innerHTML = '▶ <span>Play</span>';

  if (playerReady && player) {
    cueApprovedVideo(video);
    pendingVideo = null;
  } else {
    setPlayerStatus('Loading video player…');
    ensureYouTubePlayer();
  }

  if (timerMinutes > 0 && !countdownId) startCountdown();
  updateTimerLabel();
}

function cueApprovedVideo(video) {
  if (!playerReady || !player || !video) return;
  currentVideo = video;
  try {
    player.cueVideoById(video.id);
    enforceVolumeCap(savedVolume);
    if (isMuted) player.mute();
    setPlayerStatus('Ready — tap Play.');
  } catch (_) {
    setPlayerStatus('This video could not be prepared. Refresh KidsSite and try again.', true);
  }
}

function closeVideo() {
  pendingVideo = null;
  currentVideo = null;
  if (playerReady && player) {
    try { player.stopVideo(); } catch (_) {}
  }
  setPlayerStatus('');
  playerModal.classList.add('hidden');
  playerModal.setAttribute('aria-hidden', 'true');
}

function enforceVolumeCap(requestedVolume) {
  if (!playerReady || !player) return;
  let current = requestedVolume;
  if (typeof current !== 'number') {
    try { current = player.getVolume(); } catch (_) { current = savedVolume; }
  }
  const safeVolume = Math.min(MAX_VIDEO_VOLUME, Math.max(0, Number(current) || 0));
  try { player.setVolume(safeVolume); } catch (_) {}
  savedVolume = safeVolume;
  localStorage.setItem('kidssite_volume', String(safeVolume));
  updateVolumeUI(safeVolume);
}

function updateVolumeUI(volume) {
  const safeVolume = Math.min(MAX_VIDEO_VOLUME, Math.max(0, Number(volume) || 0));
  volumeSlider.value = String(safeVolume);
  volumeValue.textContent = `${safeVolume}%`;
}

function setVideoVolume(volume) {
  const safeVolume = Math.min(MAX_VIDEO_VOLUME, Math.max(0, Number(volume) || 0));
  savedVolume = safeVolume;
  localStorage.setItem('kidssite_volume', String(safeVolume));
  updateVolumeUI(safeVolume);

  if (playerReady && player) {
    try {
      player.setVolume(safeVolume);
      if (safeVolume > 0 && isMuted) {
        player.unMute();
        isMuted = false;
        $('muteBtn').innerHTML = '🔊 <span>Sound</span>';
      }
    } catch (_) {}
  }
}

function togglePlayPause() {
  if (!currentVideo) return;
  if (!playerReady || !player || !window.YT) {
    pendingVideo = currentVideo;
    setPlayerStatus('Loading video player…');
    ensureYouTubePlayer();
    return;
  }

  try {
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      player.pauseVideo();
    } else if (state === YT.PlayerState.ENDED) {
      player.seekTo(0, true);
      player.playVideo();
    } else {
      player.playVideo();
    }
  } catch (_) {
    setPlayerStatus('Could not start playback. Tap Play once more.', true);
  }
}

function skipSeconds(amount) {
  if (!playerReady || !player) return;
  try {
    const current = Number(player.getCurrentTime()) || 0;
    const duration = Number(player.getDuration()) || 0;
    const target = Math.max(0, duration ? Math.min(duration, current + amount) : current + amount);
    player.seekTo(target, true);
  } catch (_) {}
}

function toggleMute() {
  if (!playerReady || !player) return;
  try {
    if (player.isMuted()) {
      player.unMute();
      enforceVolumeCap(savedVolume || DEFAULT_VIDEO_VOLUME);
      isMuted = false;
      $('muteBtn').innerHTML = '🔊 <span>Sound</span>';
    } else {
      player.mute();
      isMuted = true;
      $('muteBtn').innerHTML = '🔇 <span>Muted</span>';
    }
  } catch (_) {}
}

function toggleFullscreen() {
  const wrap = $('playerStage');
  if (!document.fullscreenElement) {
    if (wrap.requestFullscreen) wrap.requestFullscreen().catch(() => {});
  } else if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
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
  timerLabel.textContent = `⏱️ ${mins}:${String(secs).padStart(2,'0')} remaining`;
}

function openParentModal() {
  parentModal.classList.remove('hidden');
  parentModal.setAttribute('aria-hidden', 'false');
  $('pinInput').value = '';
  pinGate.classList.remove('hidden');
  parentPanel.classList.add('hidden');
  setTimeout(() => $('pinInput').focus(), 100);
}

function closeParentModal() {
  parentModal.classList.add('hidden');
  parentModal.setAttribute('aria-hidden', 'true');
}

function unlockParent() {
  if ($('pinInput').value === parentPin) {
    pinGate.classList.add('hidden');
    parentPanel.classList.remove('hidden');
    viewingLocked = false;
    localStorage.setItem('kidssite_locked', 'false');
    timeUpOverlay.classList.add('hidden');
    if (timerMinutes > 0) remainingSeconds = timerMinutes * 60;
    renderManageList();
    renderTimerOptions();
  } else {
    $('pinInput').value = '';
    $('pinInput').placeholder = 'Wrong PIN - try again';
  }
}

function addVideo() {
  const title = $('videoTitleInput').value.trim();
  const url = $('videoUrlInput').value.trim();
  const category = $('videoCategoryInput').value;
  const id = extractYouTubeId(url);
  const msg = $('addMessage');

  if (!title || !id) {
    msg.textContent = 'Please enter a title and a valid YouTube link.';
    return;
  }
  if (videos.some(v => v.id === id)) {
    msg.textContent = 'That video is already approved.';
    return;
  }

  videos.unshift({ id, title, category });
  saveVideos();
  $('videoTitleInput').value = '';
  $('videoUrlInput').value = '';
  msg.textContent = '✅ Video added.';
  renderVideos();
  renderManageList();
  setTimeout(() => msg.textContent = '', 2500);
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
    row.querySelector('button').addEventListener('click', () => {
      videos = videos.filter(v => v.id !== video.id);
      saveVideos();
      renderManageList();
      renderVideos();
    });
    list.appendChild(row);
  });
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

function changePin() {
  const newPin = $('newPinInput').value.trim();
  const msg = $('pinMessage');
  if (!/^\d{4,6}$/.test(newPin)) {
    msg.textContent = 'PIN must be 4–6 numbers.';
    return;
  }
  parentPin = newPin;
  localStorage.setItem('kidssite_pin', newPin);
  $('newPinInput').value = '';
  msg.textContent = '✅ PIN changed.';
  setTimeout(() => msg.textContent = '', 2500);
}

function populateCategorySelect() {
  const select = $('videoCategoryInput');
  categories.filter(c => c.id !== 'all').forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.emoji} ${cat.name}`;
    select.appendChild(opt);
  });
}

$('parentBtn').addEventListener('click', openParentModal);
$('closeParent').addEventListener('click', closeParentModal);
$('unlockBtn').addEventListener('click', unlockParent);
$('pinInput').addEventListener('keydown', e => { if (e.key === 'Enter') unlockParent(); });
$('addVideoBtn').addEventListener('click', addVideo);
$('changePinBtn').addEventListener('click', changePin);
$('closePlayer').addEventListener('click', closeVideo);
$('homeBtn').addEventListener('click', closeVideo);
$('parentUnlockFromTimeUp').addEventListener('click', openParentModal);
$('playPauseBtn').addEventListener('click', togglePlayPause);
$('back10Btn').addEventListener('click', () => skipSeconds(-10));
$('forward10Btn').addEventListener('click', () => skipSeconds(10));
$('muteBtn').addEventListener('click', toggleMute);
$('fullscreenBtn').addEventListener('click', toggleFullscreen);
volumeSlider.addEventListener('input', e => setVideoVolume(e.target.value));

// Extra guard: even if script code requests a larger number, reset to 50% maximum.
setInterval(() => {
  if (playerReady && player && !player.isMuted() && player.getVolume() > MAX_VIDEO_VOLUME) {
    enforceVolumeCap(MAX_VIDEO_VOLUME);
  }
}, 1000);

document.querySelectorAll('.timer-option').forEach(btn => {
  btn.addEventListener('click', () => setTimer(Number(btn.dataset.minutes)));
});

playerModal.addEventListener('click', e => { if (e.target === playerModal) closeVideo(); });
parentModal.addEventListener('click', e => { if (e.target === parentModal) closeParentModal(); });

populateCategorySelect();
renderCategories();
renderVideos();
renderTimerOptions();
updateVolumeUI(savedVolume);
if (viewingLocked) timeUpOverlay.classList.remove('hidden');
