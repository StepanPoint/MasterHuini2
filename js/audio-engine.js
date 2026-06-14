/**
 * MasterHuini Audio Engine
 * Real Web Audio API processing:
 *  - Multi-track loader (MP3/WAV/OGG)
 *  - BPM detection (autocorrelation on onset envelope)
 *  - 10-band parametric EQ (BiquadFilter)
 *  - Dynamics compressor + brickwall limiter
 *  - Crossfade / auto-mix between tracks
 *  - Offline render → WAV export
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.tracks = [];          // { buffer, name, bpm, duration }
    this.sources = [];         // active BufferSourceNodes
    this.gainNodes = [];       // per-track gain
    this.masterGain = null;
    this.compressor = null;
    this.limiter = null;
    this.analyser = null;
    this.eqBands = [];         // 10 BiquadFilterNodes
    this.isPlaying = false;
    this.crossfadeDuration = 8; // seconds
    this.currentTrackIndex = 0;
    this.crossfadeTimer = null;
    this.onTrackChange = null;  // callback(index, track)
    this.onBPMDetected = null;  // callback(bpm)
    this.onEnd = null;
    this._animFrame = null;
    this.EQ_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  }

  // ── INIT CONTEXT ──────────────────────────────────────────────
  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master chain: EQ → Compressor → Limiter → Master Gain → Destination
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -0.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    // Build EQ chain
    let prev = null;
    const eqTypes = ['lowshelf','peaking','peaking','peaking','peaking','peaking','peaking','peaking','peaking','highshelf'];
    this.EQ_FREQS.forEach((freq, i) => {
      const f = this.ctx.createBiquadFilter();
      f.type = eqTypes[i];
      f.frequency.value = freq;
      f.gain.value = 0;
      f.Q.value = 1.4;
      this.eqBands.push(f);
      if (prev) prev.connect(f);
      prev = f;
    });

    // Wire: last EQ → compressor → limiter → analyser → masterGain → out
    const lastEQ = this.eqBands[this.eqBands.length - 1];
    lastEQ.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  // ── LOAD FILE ─────────────────────────────────────────────────
  async loadFile(file) {
    await this.init();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    const bpm = await this.detectBPM(audioBuffer);
    const track = {
      buffer: audioBuffer,
      name: file.name.replace(/\.[^.]+$/, ''),
      bpm: Math.round(bpm),
      duration: audioBuffer.duration,
      file,
    };
    this.tracks.push(track);
    return track;
  }

  // ── BPM DETECTION ──────────────────────────────────────────────
  // Converts stereo → mono, downsamples, computes onset envelope,
  // then autocorrelation over [60–200] BPM range.
  async detectBPM(buffer) {
    const sampleRate = buffer.sampleRate;
    const rawData = buffer.getChannelData(0);

    // Mix down to mono if stereo
    let mono;
    if (buffer.numberOfChannels >= 2) {
      const ch1 = buffer.getChannelData(0);
      const ch2 = buffer.getChannelData(1);
      mono = new Float32Array(ch1.length);
      for (let i = 0; i < ch1.length; i++) mono[i] = (ch1[i] + ch2[i]) * 0.5;
    } else {
      mono = rawData;
    }

    // Downsample to ~11025 Hz for speed
    const targetRate = 11025;
    const step = Math.floor(sampleRate / targetRate);
    const downsampled = new Float32Array(Math.floor(mono.length / step));
    for (let i = 0; i < downsampled.length; i++) downsampled[i] = mono[i * step];

    // Half-wave rectified energy envelope (window ~23ms)
    const winSize = Math.floor(targetRate * 0.023);
    const envelope = new Float32Array(downsampled.length);
    for (let i = 0; i < downsampled.length; i++) {
      const start = Math.max(0, i - winSize);
      let energy = 0;
      for (let j = start; j <= i; j++) energy += downsampled[j] * downsampled[j];
      envelope[i] = Math.sqrt(energy / (i - start + 1));
    }

    // Onset strength = positive first-order difference of envelope
    const onset = new Float32Array(envelope.length);
    for (let i = 1; i < envelope.length; i++) {
      onset[i] = Math.max(0, envelope[i] - envelope[i - 1]);
    }

    // Use first 30 seconds max
    const maxLen = Math.min(onset.length, targetRate * 30);
    const signal = onset.subarray(0, maxLen);

    // Autocorrelation over BPM [60, 200]
    let bestBPM = 120;
    let bestCorr = -Infinity;
    const minLag = Math.floor(targetRate * 60 / 200); // lag for 200 BPM
    const maxLag = Math.floor(targetRate * 60 / 60);  // lag for 60 BPM

    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      const len = signal.length - lag;
      for (let i = 0; i < len; i++) corr += signal[i] * signal[i + lag];
      corr /= len;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestBPM = (targetRate * 60) / lag;
      }
    }

    // Snap to nearest 0.5 BPM
    return Math.round(bestBPM * 2) / 2;
  }

  // ── PLAY SINGLE TRACK ─────────────────────────────────────────
  _createSource(track, gainValue = 1.0) {
    const src = this.ctx.createBufferSource();
    src.buffer = track.buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = gainValue;
    src.connect(gain);
    gain.connect(this.eqBands[0]);
    return { src, gain };
  }

  async play(index = 0) {
    await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.stopAll();

    if (!this.tracks[index]) return;
    this.currentTrackIndex = index;
    const track = this.tracks[index];

    const { src, gain } = this._createSource(track, 1.0);
    this.sources = [src];
    this.gainNodes = [gain];
    this.isPlaying = true;

    src.start(0);
    if (this.onTrackChange) this.onTrackChange(index, track);

    // Schedule crossfade to next track
    const xfadeAt = track.duration - this.crossfadeDuration;
    if (xfadeAt > 0 && this.tracks.length > 1) {
      this.crossfadeTimer = setTimeout(() => this._crossfadeToNext(), xfadeAt * 1000);
    }

    src.onended = () => {
      if (this.sources.length <= 1) {
        this.isPlaying = false;
        if (this.onEnd) this.onEnd();
      }
    };
  }

  _crossfadeToNext() {
    const nextIndex = (this.currentTrackIndex + 1) % this.tracks.length;
    const nextTrack = this.tracks[nextIndex];
    if (!nextTrack) return;

    const fadeLen = this.crossfadeDuration;
    const now = this.ctx.currentTime;

    // Fade out current
    if (this.gainNodes[0]) {
      this.gainNodes[0].gain.setValueAtTime(1, now);
      this.gainNodes[0].gain.linearRampToValueAtTime(0, now + fadeLen);
    }

    // Fade in next
    const { src: nextSrc, gain: nextGain } = this._createSource(nextTrack, 0);
    nextGain.gain.setValueAtTime(0, now);
    nextGain.gain.linearRampToValueAtTime(1, now + fadeLen);

    nextSrc.start(now);
    this.sources.push(nextSrc);
    this.gainNodes.push(nextGain);

    this.currentTrackIndex = nextIndex;
    if (this.onTrackChange) this.onTrackChange(nextIndex, nextTrack);

    // Clean old source after fade
    setTimeout(() => {
      if (this.sources[0]) {
        try { this.sources[0].stop(); } catch(e) {}
      }
      this.sources.shift();
      this.gainNodes.shift();
    }, (fadeLen + 0.5) * 1000);

    // Schedule next crossfade
    const xfadeAt = nextTrack.duration - this.crossfadeDuration;
    if (xfadeAt > 0) {
      this.crossfadeTimer = setTimeout(() => this._crossfadeToNext(), xfadeAt * 1000);
    }
  }

  stopAll() {
    clearTimeout(this.crossfadeTimer);
    this.sources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.sources = [];
    this.gainNodes = [];
    this.isPlaying = false;
  }

  pause() {
    if (this.ctx) this.ctx.suspend();
  }

  resume() {
    if (this.ctx) this.ctx.resume();
  }

  // ── EQ ────────────────────────────────────────────────────────
  // bandIndex: 0-9, gainDb: -15 to +15
  setEQBand(bandIndex, gainDb) {
    if (this.eqBands[bandIndex]) {
      this.eqBands[bandIndex].gain.value = gainDb;
    }
  }

  // ── COMPRESSOR ────────────────────────────────────────────────
  setCompressor({ threshold, ratio, attack, release, knee } = {}) {
    if (!this.compressor) return;
    if (threshold !== undefined) this.compressor.threshold.value = threshold;
    if (ratio !== undefined)     this.compressor.ratio.value = ratio;
    if (attack !== undefined)    this.compressor.attack.value = attack;
    if (release !== undefined)   this.compressor.release.value = release;
    if (knee !== undefined)      this.compressor.knee.value = knee;
  }

  // ── MASTER VOLUME ─────────────────────────────────────────────
  setMasterVolume(v) {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  // ── CROSSFADE DURATION ────────────────────────────────────────
  setCrossfadeDuration(seconds) {
    this.crossfadeDuration = seconds;
  }

  // ── ANALYSER DATA ─────────────────────────────────────────────
  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  getWaveformData() {
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  // ── WAV EXPORT ────────────────────────────────────────────────
  // Renders the entire mix offline at full quality and returns a Blob.
  async exportWAV(onProgress) {
    if (!this.tracks.length) throw new Error('Нет загруженных треков');

    // Calculate total mix duration with crossfades
    let totalDuration = 0;
    this.tracks.forEach((t, i) => {
      if (i < this.tracks.length - 1) {
        totalDuration += t.duration - this.crossfadeDuration;
      } else {
        totalDuration += t.duration;
      }
    });

    const sampleRate = this.ctx.sampleRate;
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

    // Rebuild EQ chain offline
    const eqTypes = ['lowshelf','peaking','peaking','peaking','peaking','peaking','peaking','peaking','peaking','highshelf'];
    let offlinePrev = null;
    const offlineEQ = this.EQ_FREQS.map((freq, i) => {
      const f = offlineCtx.createBiquadFilter();
      f.type = eqTypes[i];
      f.frequency.value = freq;
      f.gain.value = this.eqBands[i] ? this.eqBands[i].gain.value : 0;
      f.Q.value = 1.4;
      if (offlinePrev) offlinePrev.connect(f);
      offlinePrev = f;
      return f;
    });

    const offlineComp = offlineCtx.createDynamicsCompressor();
    offlineComp.threshold.value = this.compressor.threshold.value;
    offlineComp.ratio.value = this.compressor.ratio.value;
    offlineComp.knee.value = this.compressor.knee.value;
    offlineComp.attack.value = this.compressor.attack.value;
    offlineComp.release.value = this.compressor.release.value;

    const offlineLimiter = offlineCtx.createDynamicsCompressor();
    offlineLimiter.threshold.value = -0.5;
    offlineLimiter.knee.value = 0;
    offlineLimiter.ratio.value = 20;
    offlineLimiter.attack.value = 0.001;
    offlineLimiter.release.value = 0.1;

    const offlineMaster = offlineCtx.createGain();
    offlineMaster.gain.value = this.masterGain.gain.value;

    offlineEQ[offlineEQ.length - 1].connect(offlineComp);
    offlineComp.connect(offlineLimiter);
    offlineLimiter.connect(offlineMaster);
    offlineMaster.connect(offlineCtx.destination);

    // Schedule sources with crossfades
    let startTime = 0;
    this.tracks.forEach((track, i) => {
      const src = offlineCtx.createBufferSource();
      src.buffer = track.buffer;
      const gain = offlineCtx.createGain();
      src.connect(gain);
      gain.connect(offlineEQ[0]);

      const xfade = this.crossfadeDuration;
      const endTime = startTime + track.duration;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(1, startTime + Math.min(xfade, track.duration * 0.1));

      if (i < this.tracks.length - 1) {
        gain.gain.setValueAtTime(1, endTime - xfade);
        gain.gain.linearRampToValueAtTime(0, endTime);
      }

      src.start(startTime);
      src.stop(endTime);

      if (i < this.tracks.length - 1) {
        startTime += track.duration - xfade;
      }
    });

    if (onProgress) onProgress(10, 'Рендеринг аудио…');

    const rendered = await offlineCtx.startRendering();
    if (onProgress) onProgress(80, 'Кодирование WAV…');

    const wav = this._encodeWAV(rendered);
    if (onProgress) onProgress(100, 'Готово!');
    return new Blob([wav], { type: 'audio/wav' });
  }

  // ── WAV ENCODER ───────────────────────────────────────────────
  _encodeWAV(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const numSamples = audioBuffer.length;
    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;
    const bufferSize = 44 + dataSize;

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);       // chunk size
    view.setUint16(20, 1, true);        // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);       // bits per sample
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleave channels + convert float → int16
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = audioBuffer.getChannelData(ch)[i];
        const clamped = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, clamped * 0x7FFF, true);
        offset += 2;
      }
    }

    return buffer;
  }
}

// ── VISUALIZER ────────────────────────────────────────────────────
class Visualizer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext('2d');
    this.engine = engine;
    this._animFrame = null;
    this.mode = 'bars'; // 'bars' | 'waveform'
  }

  start() {
    this._draw();
  }

  stop() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
  }

  _draw() {
    this._animFrame = requestAnimationFrame(() => this._draw());
    const { canvas, ctx2d, engine } = this;
    const W = canvas.width;
    const H = canvas.height;

    ctx2d.clearRect(0, 0, W, H);

    if (this.mode === 'bars') {
      const data = engine.getFrequencyData();
      const barCount = 64;
      const barW = W / barCount - 1;

      for (let i = 0; i < barCount; i++) {
        const idx = Math.floor((i / barCount) * data.length * 0.6);
        const val = data[idx] / 255;
        const barH = val * H;

        // Gold → purple gradient per bar
        const grad = ctx2d.createLinearGradient(0, H - barH, 0, H);
        grad.addColorStop(0, `rgba(245,166,35,${0.9 + val * 0.1})`);
        grad.addColorStop(1, 'rgba(108,63,197,0.6)');
        ctx2d.fillStyle = grad;

        ctx2d.beginPath();
        ctx2d.roundRect(i * (barW + 1), H - barH, barW, barH, 3);
        ctx2d.fill();
      }
    } else {
      const data = engine.getWaveformData();
      ctx2d.strokeStyle = '#f5a623';
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      const sliceW = W / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128 - 1;
        const y = (v * H / 2) + H / 2;
        i === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
        x += sliceW;
      }
      ctx2d.stroke();
    }
  }
}

window.AudioEngine = AudioEngine;
window.Visualizer = Visualizer;
