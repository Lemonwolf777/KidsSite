const categories = [
  { id: 'all', name: 'All Videos', emoji: '🌈', desc: 'Everything approved in one happy place', banner: 'Every approved video, all together.' },
  { id: 'learn', name: 'Learn', emoji: '📚', desc: 'Colours, words, science and more', banner: 'Fun videos for discovering something new.' },
  { id: 'animals', name: 'Animals', emoji: '🐯', desc: 'Wild friends, pets and nature', banner: 'Meet amazing animals from around the world.' },
  { id: 'cartoons', name: 'Cartoons', emoji: '🎨', desc: 'Funny, colourful animated adventures', banner: 'Approved cartoons ready for playtime.' },
  { id: 'songs', name: 'Songs', emoji: '🎵', desc: 'Sing, dance and move along', banner: 'Music and sing-along videos for happy ears.' },
  { id: 'stories', name: 'Stories', emoji: '📖', desc: 'Big adventures and bedtime tales', banner: 'Story time starts right here.' },
  { id: 'math', name: 'Math', emoji: '🔢', desc: 'Numbers, counting and easy maths', banner: 'Make numbers feel like a game.' }
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
const playerModal = $('playerModal');
const playerFrame = $('playerFrame');
const playerTitle = $('playerTitle');
const videoWrap = $('videoWrap');
const landscapeFullscreenBtn = $('landscapeFullscreenBtn');
const timerLabel = $('timerLabel');
const parentModal = $('parentModal');
const pinGate = $('pinGate');
const parentPanel = $('parentPanel');
const timeUpOverlay = $('timeUpOverlay');
const syncStatus = $('syncStatus');

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

function openCategory(categoryId) {
  currentCategory = categories.some(c => c.id === categoryId) ? categoryId : 'all';
  renderVideos();
  homeView.classList.add('hidden');
  categoryView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function showCategories() {
  categoryView.classList.add('hidden');
  homeView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderVideos() {
  const filtered = currentCategory === 'all' ? videos : videos.filter(v => v.category === currentCategory);
  const cat = categories.find(c => c.id === currentCategory) || categories[0];

  categoryView.dataset.category = cat.id;
  categoryBannerEmoji.textContent = cat.emoji;
  categoryBannerTitle.textContent = cat.name;
  categoryBannerText.textContent = cat.banner;
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

function openVideo(video) {
  if (viewingLocked) {
    timeUpOverlay.classList.remove('hidden');
    return;
  }
  playerTitle.textContent = video.title;
  playerFrame.src = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1`;
  playerModal.classList.remove('hidden');
  playerModal.setAttribute('aria-hidden', 'false');
  if (timerMinutes > 0 && !countdownId) startCountdown();
  updateTimerLabel();
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
    setTimeout(lockLandscape, 50);
  } else {
    unlockOrientation();
  }
}

function closeVideo() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
  unlockOrientation();
  playerFrame.src = '';
  playerModal.classList.add('hidden');
  playerModal.setAttribute('aria-hidden', 'true');
}

function goHomeFromPlayer() {
  closeVideo();
  showCategories();
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
  parentModal.classList.remove('hidden');
  parentModal.setAttribute('aria-hidden', 'false');
  $('pinInput').value = '';
  $('pinStatus').textContent = '';
  pinGate.classList.remove('hidden');
  parentPanel.classList.add('hidden');
  setTimeout(() => $('pinInput').focus(), 100);
}

function closeParentModal() {
  parentModal.classList.add('hidden');
  parentModal.setAttribute('aria-hidden', 'true');
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

$('parentBtn').addEventListener('click', openParentModal);
$('closeParent').addEventListener('click', closeParentModal);
$('unlockBtn').addEventListener('click', unlockParent);
$('pinInput').addEventListener('keydown', e => { if (e.key === 'Enter') unlockParent(); });
$('addVideoBtn').addEventListener('click', addVideo);
$('importVideosBtn').addEventListener('click', importLegacyVideos);
$('closePlayer').addEventListener('click', closeVideo);
$('backCategories').addEventListener('click', showCategories);
$('emptyBackBtn').addEventListener('click', showCategories);
landscapeFullscreenBtn.addEventListener('click', enterLandscapeFullscreen);
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
$('homeBtn').addEventListener('click', goHomeFromPlayer);
$('parentUnlockFromTimeUp').addEventListener('click', openParentModal);

document.querySelectorAll('.timer-option').forEach(btn => {
  btn.addEventListener('click', () => setTimer(Number(btn.dataset.minutes)));
});

playerModal.addEventListener('click', e => { if (e.target === playerModal) closeVideo(); });
parentModal.addEventListener('click', e => { if (e.target === parentModal) closeParentModal(); });

populateCategorySelect();
renderCategories();
renderTimerOptions();
renderVideos();
loadVideos();
if (viewingLocked) timeUpOverlay.classList.remove('hidden');
