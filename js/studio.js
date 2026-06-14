/**
 * MasterHuini Studio Controller
 * Connects AudioEngine to the Studio UI
 */

(function() {
  'use strict';

  const engine = new AudioEngine();
  let visualizer = null;
  let grInterval = null;

  const EQ_LABELS = ['32Hz','64Hz','125Hz','250Hz','500Hz','1kHz','2kHz','4kHz','8kHz','16kHz'];

  // ── INIT EQ SLIDERS ──────────────────────────────────────────
  function buildEQ() {
    const grid = document.getElementById('eq-grid');
    if (!grid) return;
    grid.innerHTML = '';
    EQ_LABELS.forEach((label, i) => {
      const group = document.createElement('div');
      group.className = 'eq-band';
      group.style.display = 'flex';
      group.style.flexDirection = 'column';
      group.style.alignItems = 'center';
      group.style.gap = '6px';
      group.style.flex = '1';

      const valEl = document.createElement('span');
      valEl.style.cssText = 'font-size:0.7rem; color:var(--accent-gold); font-variant-numeric:tabular-nums;';
      valEl.textContent = '0';

      // Vertical range slider via transform
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative; height:100px; display:flex; align-items:center; justify-content:center;';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '-15';
      slider.max = '15';
      slider.value = '0';
      slider.style.cssText = `
        -webkit-appearance: none;
        width: 90px;
        height: 4px;
        background: rgba(255,255,255,0.1);
        border-radius: 4px;
        outline: none;
        transform: rotate(-90deg);
        cursor: pointer;
      `;

      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        valEl.textContent = (v > 0 ? '+' : '') + v;
        engine.setEQBand(i, v);
        // Visual color feedback
        if (v > 0) valEl.style.color = '#f5a623';
        else if (v < 0) valEl.style.color = '#a78bfa';
        else valEl.style.color = 'var(--text-dim)';
      });

      // Webkit thumb style via inline <style>
      const labelEl = document.createElement('span');
      labelEl.className = 'eq-band-label';
      labelEl.textContent = label;

      wrap.appendChild(slider);
      group.appendChild(valEl);
      group.appendChild(wrap);
      group.appendChild(labelEl);
      grid.appendChild(group);
    });

    // Add thumb style once
    if (!document.getElementById('eq-thumb-style')) {
      const s = document.createElement('style');
      s.id = 'eq-thumb-style';
      s.textContent = `
        #eq-grid input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: var(--accent-gold);
          cursor: pointer;
          box-shadow: 0 0 6px rgba(245,166,35,0.5);
        }
        #eq-grid input[type=range]::-moz-range-thumb {
          width: 14px; height: 14px;
          border-radius: 50%;
          background: var(--accent-gold);
          border: none;
          cursor: pointer;
        }
      `;
      document.head.appendChild(s);
    }
  }

  // ── FILE DROP / PICK ─────────────────────────────────────────
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  if (dropZone) {
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent-gold)';
      dropZone.style.background = 'rgba(245,166,35,0.05)';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'rgba(245,166,35,0.3)';
      dropZone.style.background = '';
    });

    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.style.borderColor = 'rgba(245,166,35,0.3)';
      dropZone.style.background = '';
      handleFiles(Array.from(e.dataTransfer.files));
    });

    dropZone.addEventListener('click', e => {
      if (e.target === dropZone || e.target.tagName === 'P' || e.target.tagName === 'DIV') {
        fileInput && fileInput.click();
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => handleFiles(Array.from(fileInput.files)));
  }

  async function handleFiles(files) {
    const audioFiles = files.filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(f.name));
    if (!audioFiles.length) {
      showToast('⚠️ Загрузи аудио файлы (MP3, WAV, OGG)');
      return;
    }

    for (const file of audioFiles) {
      await loadSingleFile(file);
    }
  }

  async function loadSingleFile(file) {
    const row = addTrackRow(file.name, 'Анализ BPM…');
    try {
      const track = await engine.loadFile(file);
      updateTrackRow(row, track);
      updateStatusPanel();
      revealPanels();
    } catch (err) {
      updateTrackRow(row, null, 'Ошибка: ' + err.message);
    }
  }

  // ── TRACK LIST UI ─────────────────────────────────────────────
  const trackList = document.getElementById('track-list');

  function addTrackRow(name, status) {
    const row = document.createElement('div');
    row.style.cssText = `
      display:flex; align-items:center; gap:12px;
      padding:12px 16px;
      background:var(--bg-deep);
      border:1px solid var(--border);
      border-radius:10px;
    `;

    const icon = document.createElement('div');
    icon.style.cssText = 'width:38px;height:38px;border-radius:8px;background:linear-gradient(135deg,var(--purple-mid),var(--accent-gold));display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.1rem;';
    icon.textContent = '🎵';

    const info = document.createElement('div');
    info.style.flex = '1';
    info.innerHTML = `
      <strong style="display:block;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;">${name}</strong>
      <span class="track-status" style="font-size:0.75rem;color:var(--text-dim);">${status}</span>
    `;

    const spinner = document.createElement('div');
    spinner.className = 'track-spinner';
    spinner.style.cssText = 'width:16px;height:16px;border:2px solid rgba(245,166,35,0.2);border-top-color:var(--accent-gold);border-radius:50%;animation:spin 0.8s linear infinite;flex-shrink:0;';
    if (!document.getElementById('spin-style')) {
      const s = document.createElement('style');
      s.id = 'spin-style';
      s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(s);
    }

    const playBtn = document.createElement('button');
    playBtn.className = 'ctrl-btn';
    playBtn.textContent = '▶';
    playBtn.style.display = 'none';
    playBtn.style.color = 'var(--accent-gold)';
    playBtn.addEventListener('click', () => {
      const idx = Array.from(trackList.children).indexOf(row);
      if (idx >= 0) playTrack(idx);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'ctrl-btn';
    removeBtn.textContent = '✕';
    removeBtn.style.display = 'none';
    removeBtn.style.color = 'var(--text-dim)';
    removeBtn.addEventListener('click', () => {
      const idx = Array.from(trackList.children).indexOf(row);
      if (idx >= 0) {
        engine.tracks.splice(idx, 1);
        row.remove();
        updateStatusPanel();
        if (!engine.tracks.length) hidePanels();
      }
    });

    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(spinner);
    row.appendChild(playBtn);
    row.appendChild(removeBtn);
    trackList.appendChild(row);
    return row;
  }

  function updateTrackRow(row, track, errMsg) {
    const spinner = row.querySelector('.track-spinner');
    const status = row.querySelector('.track-status');
    const playBtn = row.querySelectorAll('button')[0];
    const removeBtn = row.querySelectorAll('button')[1];

    if (spinner) spinner.style.display = 'none';
    if (playBtn) playBtn.style.display = 'block';
    if (removeBtn) removeBtn.style.display = 'block';

    if (track) {
      if (status) {
        const dur = formatTime(track.duration);
        status.textContent = `${track.bpm} BPM · ${dur}`;
        status.style.color = 'var(--accent-gold)';
      }
    } else {
      if (status) {
        status.textContent = errMsg || 'Ошибка';
        status.style.color = '#f87171';
      }
      if (playBtn) playBtn.style.display = 'none';
    }
  }

  // ── PLAYBACK ──────────────────────────────────────────────────
  engine.onTrackChange = (idx, track) => {
    const np = document.getElementById('now-playing');
    const bpmEl = document.getElementById('studio-bpm');
    const durEl = document.getElementById('studio-dur');
    if (np) np.textContent = track.name;
    if (bpmEl) bpmEl.textContent = track.bpm + ' BPM';
    if (durEl) durEl.textContent = formatTime(track.duration);

    // Highlight active row
    Array.from(trackList.children).forEach((r, i) => {
      r.style.borderColor = i === idx ? 'rgba(245,166,35,0.5)' : 'var(--border)';
      r.style.background = i === idx ? 'rgba(245,166,35,0.06)' : 'var(--bg-deep)';
    });
  };

  engine.onEnd = () => {
    const btn = document.getElementById('studio-play-btn');
    if (btn) btn.innerHTML = '▶';
  };

  function playTrack(idx) {
    engine.play(idx);
    const btn = document.getElementById('studio-play-btn');
    if (btn) btn.innerHTML = '⏸';
    if (visualizer) visualizer.start();
    startGRMeter();
  }

  const studioPlayBtn = document.getElementById('studio-play-btn');
  if (studioPlayBtn) {
    studioPlayBtn.addEventListener('click', () => {
      if (!engine.tracks.length) { showToast('⚠️ Сначала загрузи треки'); return; }
      if (engine.isPlaying) {
        engine.pause();
        studioPlayBtn.innerHTML = '▶';
      } else {
        if (engine.sources.length) {
          engine.resume();
        } else {
          playTrack(engine.currentTrackIndex || 0);
        }
        studioPlayBtn.innerHTML = '⏸';
        if (visualizer) visualizer.start();
        startGRMeter();
      }
    });
  }

  document.getElementById('prev-btn')?.addEventListener('click', () => {
    const idx = Math.max(0, engine.currentTrackIndex - 1);
    if (engine.tracks[idx]) playTrack(idx);
  });

  document.getElementById('next-btn')?.addEventListener('click', () => {
    const idx = (engine.currentTrackIndex + 1) % engine.tracks.length;
    if (engine.tracks[idx]) playTrack(idx);
  });

  // ── AUTO-MIX ──────────────────────────────────────────────────
  const automixBtn = document.getElementById('automix-btn');
  if (automixBtn) {
    automixBtn.addEventListener('click', () => {
      if (!engine.tracks.length) { showToast('⚠️ Сначала загрузи треки'); return; }
      if (engine.tracks.length < 2) { showToast('⚠️ Нужно минимум 2 трека для авто-микса'); return; }
      playTrack(0);
      showToast('🎛 Авто-микс запущен! Переходы через ' + engine.crossfadeDuration + ' сек до конца каждого трека');
    });
  }

  // ── MASTER VOLUME ─────────────────────────────────────────────
  const masterVol = document.getElementById('master-vol');
  if (masterVol) {
    masterVol.addEventListener('input', () => {
      engine.setMasterVolume(masterVol.value / 100);
      const icon = document.getElementById('vol-icon');
      if (icon) icon.textContent = masterVol.value > 60 ? '🔊' : masterVol.value > 10 ? '🔉' : '🔇';
    });
  }

  // ── CROSSFADE ─────────────────────────────────────────────────
  const xfadeSlider = document.getElementById('xfade-slider');
  if (xfadeSlider) {
    xfadeSlider.addEventListener('input', () => {
      const v = parseInt(xfadeSlider.value);
      engine.setCrossfadeDuration(v);
      const el = document.getElementById('xfade-val');
      if (el) el.textContent = v + ' сек';
    });
  }

  // ── COMPRESSOR CONTROLS ───────────────────────────────────────
  function wireComp(id, valId, param, mult, suffix) {
    const el = document.getElementById(id);
    const val = document.getElementById(valId);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value) * (mult || 1);
      if (val) val.textContent = (param === 'ratio') ? v + ':1' : v + (suffix || '');
      const upd = {};
      upd[param] = (param === 'attack' || param === 'release') ? v / 1000 : v;
      engine.setCompressor(upd);
    });
  }

  wireComp('comp-threshold', 'comp-threshold-val', 'threshold', 1, ' dB');
  wireComp('comp-ratio',     'comp-ratio-val',     'ratio',     1, '');
  wireComp('comp-attack',    'comp-attack-val',     'attack',    1, ' ms');
  wireComp('comp-release',   'comp-release-val',    'release',   1, ' ms');
  wireComp('comp-knee',      'comp-knee-val',       'knee',      1, ' dB');

  // ── GAIN REDUCTION METER ─────────────────────────────────────
  function startGRMeter() {
    if (grInterval) return;
    grInterval = setInterval(() => {
      const gr = document.getElementById('gr-meter');
      if (!gr || !engine.compressor) return;
      const reduction = engine.compressor.reduction;
      gr.textContent = (reduction).toFixed(1) + ' dB';
      gr.style.color = reduction < -3 ? '#f87171' : reduction < -1 ? '#fbbf24' : '#4ade80';
    }, 100);
  }

  // ── VIZ MODE BUTTONS ─────────────────────────────────────────
  document.querySelectorAll('.viz-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!visualizer) return;
      visualizer.mode = btn.dataset.mode;
      document.querySelectorAll('.viz-mode-btn').forEach(b => {
        b.style.borderColor = 'var(--border)';
        b.style.color = 'var(--text-mid)';
      });
      btn.style.borderColor = 'var(--accent-gold)';
      btn.style.color = 'var(--accent-gold)';
    });
  });

  // ── WAV EXPORT ───────────────────────────────────────────────
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      if (!engine.tracks.length) { showToast('⚠️ Сначала загрузи треки'); return; }

      exportBtn.disabled = true;
      exportBtn.textContent = 'Рендеринг…';
      const prog = document.getElementById('export-progress');
      const fill = document.getElementById('export-fill');
      const label = document.getElementById('export-label');
      const pct = document.getElementById('export-pct');
      if (prog) prog.style.display = 'flex';

      try {
        const blob = await engine.exportWAV((p, msg) => {
          if (fill) fill.style.width = p + '%';
          if (label) label.textContent = msg;
          if (pct) pct.textContent = p + '%';
        });

        // Download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const mixName = engine.tracks.length === 1
          ? engine.tracks[0].name
          : 'MasterHuini_Mix_' + new Date().toISOString().slice(0,10);
        a.download = mixName + '.wav';
        a.click();
        URL.revokeObjectURL(url);
        showToast('✅ WAV скачан!');
      } catch (err) {
        showToast('❌ Ошибка экспорта: ' + err.message);
        console.error(err);
      } finally {
        exportBtn.disabled = false;
        exportBtn.textContent = '💾 Рендер и скачать WAV';
        if (prog) setTimeout(() => { prog.style.display = 'none'; }, 2000);
      }
    });
  }

  // ── PANELS SHOW/HIDE ─────────────────────────────────────────
  function revealPanels() {
    ['visualizer-panel','eq-panel','comp-panel','mix-card','export-card'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'block';
    });
    if (!visualizer) {
      const canvas = document.getElementById('visualizer-canvas');
      if (canvas) {
        visualizer = new Visualizer(canvas, engine);
        // Resize canvas to pixel density
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = 120 * dpr;
        visualizer.ctx2d.scale(dpr, dpr);
        visualizer.start();
      }
    }
    buildEQ();
  }

  function hidePanels() {
    ['visualizer-panel','eq-panel','comp-panel','mix-card','export-card'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  // ── STATUS PANEL ─────────────────────────────────────────────
  function updateStatusPanel() {
    const t = document.getElementById('status-tracks');
    const sr = document.getElementById('status-sr');
    const lat = document.getElementById('status-lat');
    if (t) t.textContent = engine.tracks.length;
    if (engine.ctx) {
      if (sr) sr.textContent = engine.ctx.sampleRate + ' Hz';
      if (lat) lat.textContent = ((engine.ctx.baseLatency || 0) * 1000).toFixed(1) + ' ms';
    }
  }

  // Check Web Audio API support
  const apiStatus = document.getElementById('status-api');
  if (!window.AudioContext && !window.webkitAudioContext) {
    if (apiStatus) { apiStatus.textContent = '✗ Не поддерживается'; apiStatus.style.color = '#f87171'; }
  }

  // ── TOAST ─────────────────────────────────────────────────────
  function showToast(msg) {
    let toast = document.getElementById('mh-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mh-toast';
      toast.style.cssText = `
        position:fixed; bottom:32px; left:50%; transform:translateX(-50%);
        background:var(--bg-card); border:1px solid var(--border);
        color:var(--text-bright); padding:12px 24px; border-radius:50px;
        font-size:0.88rem; font-family:'Space Grotesk',sans-serif;
        z-index:9999; box-shadow:0 8px 32px rgba(0,0,0,0.4);
        transition: opacity 0.3s;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
  }

  // ── UTILS ────────────────────────────────────────────────────
  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return m + ':' + s;
  }

  // Expose for global use
  window._mhEngine = engine;
  window._mhShowToast = showToast;
})();
