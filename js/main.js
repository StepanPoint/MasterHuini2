/* MasterHuini — main.js */

// ── PAGE ROUTER ──
const pages = {
  home: document.getElementById('page-home'),
  studio: document.getElementById('page-studio'),
  register: document.getElementById('page-register'),
};

function showPage(name) {
  Object.values(pages).forEach(p => p && p.classList.remove('active'));
  if (pages[name]) pages[name].classList.add('active');
  window.scrollTo({ top: 0 });
  document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === name);
  });
  closeMobileMenu();
}

document.querySelectorAll('[data-page]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    showPage(el.dataset.page);
  });
});

// ── MOBILE MENU ──
const mobileMenu = document.getElementById('mobile-menu');
document.getElementById('hamburger-btn').addEventListener('click', () => {
  mobileMenu.classList.add('open');
});
document.getElementById('mobile-close').addEventListener('click', closeMobileMenu);
function closeMobileMenu() {
  mobileMenu.classList.remove('open');
}

// ── WAVEFORM PLAYER ──
const bars = document.querySelectorAll('.waveform-bars .bar');
let currentBar = 0;
let isPlaying = false;
let playerInterval = null;
const playBtn = document.querySelector('.ctrl-btn.play-btn');
const timeDisplay = document.querySelector('.ctrl-time');
const totalDuration = bars.length;

function updateTime(idx) {
  const elapsed = Math.floor((idx / totalDuration) * 214);
  const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  const em = '03', es = '34';
  timeDisplay.textContent = `${m}:${s} / ${em}:${es}`;
}

function renderBars(idx) {
  bars.forEach((bar, i) => {
    bar.classList.toggle('played', i <= idx);
    bar.classList.toggle('upcoming', i > idx);
  });
  updateTime(idx);
}

function startPlayer() {
  isPlaying = true;
  playBtn.innerHTML = '⏸';
  playerInterval = setInterval(() => {
    if (currentBar < totalDuration - 1) {
      currentBar++;
      renderBars(currentBar);
    } else {
      stopPlayer();
    }
  }, 80);
}

function stopPlayer() {
  isPlaying = false;
  playBtn.innerHTML = '▶';
  clearInterval(playerInterval);
}

if (playBtn) {
  playBtn.addEventListener('click', () => {
    isPlaying ? stopPlayer() : startPlayer();
  });
}

document.querySelectorAll('.waveform-bars .bar').forEach((bar, i) => {
  bar.addEventListener('click', () => {
    currentBar = i;
    renderBars(currentBar);
  });
});

// ── TRACK ROWS ──
document.querySelectorAll('.track-row').forEach(row => {
  row.addEventListener('click', () => {
    const name = row.querySelector('.track-info strong')?.textContent;
    const genre = row.querySelector('.track-genre')?.textContent || '';
    if (name) {
      document.querySelector('.track-meta strong').textContent = name;
      document.querySelector('.track-meta span').textContent = genre;
      currentBar = 0;
      stopPlayer();
      renderBars(0);
      setTimeout(startPlayer, 300);
    }
  });
});

// ── AUTH TABS ──
const authTabs = document.querySelectorAll('.auth-tab');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    authTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    if (tab.dataset.tab === 'login') {
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
    } else {
      loginForm.style.display = 'none';
      registerForm.style.display = 'block';
    }
  });
});

// ── STUDIO — GENRE TAGS ──
document.querySelectorAll('.genre-tag').forEach(tag => {
  tag.addEventListener('click', () => {
    tag.closest('.genre-tags')?.querySelectorAll('.genre-tag').forEach(t => t.classList.remove('active'));
    tag.classList.add('active');
  });
});

// ── STUDIO — AUTO-MIX GENERATION ──
const generateBtn = document.getElementById('generate-btn');
const aiProgress = document.getElementById('ai-progress');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const progressPct = document.getElementById('progress-pct');

const steps = [
  'Анализ треков…',
  'Определение BPM и ключа…',
  'Подбор точек перехода…',
  'Наложение эффектов…',
  'Рендеринг микса…',
  'Готово! 🎉',
];

if (generateBtn) {
  generateBtn.addEventListener('click', () => {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Генерация…';
    aiProgress.classList.add('visible');
    let step = 0;
    let pct = 0;
    const interval = setInterval(() => {
      if (step < steps.length) {
        progressLabel.textContent = steps[step];
        pct = Math.min(100, Math.round(((step + 1) / steps.length) * 100));
        progressFill.style.width = pct + '%';
        progressPct.textContent = pct + '%';
        step++;
      } else {
        clearInterval(interval);
        generateBtn.disabled = false;
        generateBtn.textContent = '✨ Сгенерировать новый микс';
      }
    }, 900);
  });
}

// ── STUDIO — FADERS ANIMATION ──
function animateFaders() {
  document.querySelectorAll('.channel-fader-fill').forEach(fill => {
    const rand = 40 + Math.random() * 55;
    fill.style.height = rand + '%';
  });
}
setInterval(animateFaders, 1800);
animateFaders();

// ── STUDIO — EQ BARS ANIMATION ──
function animateEQ() {
  document.querySelectorAll('.eq-band-bar').forEach(bar => {
    const rand = 20 + Math.random() * 80;
    bar.style.height = rand + 'px';
  });
}
setInterval(animateEQ, 600);

// ── EFFECT SLIDERS — live value display ──
document.querySelectorAll('.effect-slider').forEach(slider => {
  const label = slider.closest('.effect-knob-group')?.querySelector('label span');
  if (label) {
    slider.addEventListener('input', () => {
      label.textContent = slider.value + (slider.dataset.unit || '%');
    });
  }
});

// ── SCROLL ANIMATIONS ──
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.feature-card, .stat-item, .sidebar-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

// ── VOLUME SLIDER ──
const volSlider = document.querySelector('.ctrl-vol input[type=range]');
if (volSlider) {
  volSlider.addEventListener('input', () => {
    const val = volSlider.value;
    const icon = volSlider.previousElementSibling;
    if (icon) icon.textContent = val > 50 ? '🔊' : val > 0 ? '🔉' : '🔇';
  });
}

// ── COUNTER ANIMATION ──
function animateCounters() {
  document.querySelectorAll('.stat-num').forEach(el => {
    const target = parseInt(el.dataset.target || '0');
    const suffix = el.dataset.suffix || '';
    let cur = 0;
    const step = Math.ceil(target / 60);
    const t = setInterval(() => {
      cur = Math.min(cur + step, target);
      el.textContent = cur.toLocaleString() + suffix;
      if (cur >= target) clearInterval(t);
    }, 25);
  });
}

const statsObserver = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) {
    animateCounters();
    statsObserver.disconnect();
  }
}, { threshold: 0.5 });

const statsBand = document.querySelector('.stats-band');
if (statsBand) statsObserver.observe(statsBand);

// init
renderBars(0);
showPage('home');
