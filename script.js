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

let videos = JSON.parse(localStorage.getItem('kidssite_videos') || 'null') || starterVideos;
let currentCategory = 'all';
let parentPin = localStorage.getItem('kidssite_pin') || '1234';
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

document.querySelectorAll('.timer-option').forEach(btn => {
  btn.addEventListener('click', () => setTimer(Number(btn.dataset.minutes)));
});

playerModal.addEventListener('click', e => { if (e.target === playerModal) closeVideo(); });
parentModal.addEventListener('click', e => { if (e.target === parentModal) closeParentModal(); });

populateCategorySelect();
renderCategories();
renderVideos();
renderTimerOptions();
if (viewingLocked) timeUpOverlay.classList.remove('hidden');
