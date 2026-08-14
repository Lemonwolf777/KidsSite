const categories = [
  { id: 'all', name: 'All', emoji: '🌈' },
  { id: 'learn', name: 'Learn', emoji: '📚' },
  { id: 'animals', name: 'Animals', emoji: '🐯' },
  { id: 'cartoons', name: 'Cartoons', emoji: '🎨' },
  { id: 'songs', name: 'Songs', emoji: '🎵' },
  { id: 'stories', name: 'Stories', emoji: '📖' },
  { id: 'math', name: 'Math', emoji: '🔢' }
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
const categoriesEl = $('categories');
const videoGrid = $('videoGrid');
const emptyState = $('emptyState');
const sectionTitle = $('sectionTitle');
const videoCount = $('videoCount');
const playerModal = $('playerModal');
const playerFrame = $('playerFrame');
const playerTitle = $('playerTitle');
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

function closeVideo() {
  playerFrame.src = '';
  playerModal.classList.add('hidden');
  playerModal.setAttribute('aria-hidden', 'true');
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
$('homeBtn').addEventListener('click', closeVideo);
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
