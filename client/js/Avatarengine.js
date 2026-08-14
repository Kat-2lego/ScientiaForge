/**
 * AvatarEngine.js  (enhanced)
 *
 * Canvas-based 2D talking avatar. This is a drop-in replacement for your
 * existing AvatarEngine.js — the public API is unchanged:
 *
 *   const eng = new AvatarEngine(canvasEl, personaId);
 *   eng.start();                // begin idle animation loop
 *   eng.attachAudio(audioEl);   // drive lipsync from real TTS audio
 *   eng.detachAudio();          // stop lipsync, mouth returns to rest
 *   eng.switchPersona(id);      // change look mid-session
 *   eng._draw(0);               // draw a single static frame (used for
 *                                // the small persona-card previews)
 *
 * What's new vs. a basic version:
 *  - Randomized human-like blinking (not on a fixed metronome)
 *  - Lipsync driven by a real-time amplitude analysis of the TTS audio
 *    (Web Audio AnalyserNode) — the mouth actually reacts to loudness,
 *    not a canned animation. This is amplitude-based, not true viseme/
 *    phoneme lipsync (Edge TTS doesn't expose phoneme timing through the
 *    streaming endpoint), but it reads as natural talking motion.
 *  - Subtle idle head sway + breathing bob so the avatar never looks frozen
 *  - Distinct color palette / hair style per persona, with a deterministic
 *    fallback look for any custom persona (search or user-typed roles).
 */

const PERSONA_LOOKS = {
  "senior-engineer": { skin: "#e8b48c", hair: "#2b2320", hairStyle: "short", outfit: "#2b3a55", accent: "#4f6d9a" },
  "hr-manager":       { skin: "#8a5a3c", hair: "#1a1210", hairStyle: "curly", outfit: "#7a3b5e", accent: "#c76a94" },
  "product-manager":  { skin: "#f0c9a0", hair: "#4a3320", hairStyle: "short", outfit: "#2f6f4f", accent: "#5fae82" },
  "consultant":       { skin: "#caa06a", hair: "#100e0c", hairStyle: "long",  outfit: "#5b3d8a", accent: "#9a7bd1" },
};

const LOOK_POOL = Object.values(PERSONA_LOOKS);
const DEFAULT_LOOK = { skin: "#e0b28f", hair: "#3a2a20", hairStyle: "short", outfit: "#374151", accent: "#6b7fb0" };

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export class AvatarEngine {
  constructor(canvas, personaId) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.personaId = personaId;
    this.look = PERSONA_LOOKS[personaId] || this._lookForUnknown(personaId);

    this._running = false;
    this._rafId = null;
    this._lastFrame = null;
    this._t0 = performance.now();

    // Blink state
    this._blinkTimer = this._randomBlinkDelay();
    this._blinkProgress = 0; // 0 = fully open, 1 = fully closed
    this._blinking = false;
    this._blinkPhase = "closing";

    // Lipsync state
    this._audioCtx = null;
    this._analyser = null;
    this._audioData = null;
    this._mouthOpen = 0;
    this._speaking = false;

    this._loop = this._loop.bind(this);
  }

  _lookForUnknown(id) {
    return LOOK_POOL[hashString(id || "guest") % LOOK_POOL.length] || DEFAULT_LOOK;
  }

  _randomBlinkDelay() {
    // Real humans blink roughly every 2-6 seconds, irregularly.
    return 2200 + Math.random() * 3200;
  }

  switchPersona(personaId) {
    this.personaId = personaId;
    this.look = PERSONA_LOOKS[personaId] || this._lookForUnknown(personaId);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastFrame = performance.now();
    this._rafId = requestAnimationFrame(this._loop);
  }

  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    this.detachAudio();
  }

  /**
   * Connect a playing <audio> element so the mouth reacts to its volume.
   * Safe to call every time a new line starts speaking.
   */
  attachAudio(audioEl) {
    try {
      if (!this._audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this._audioCtx = new AC();
      }
      if (this._audioCtx.state === "suspended") this._audioCtx.resume();

      // A given <audio> element can only be wrapped in a MediaElementSource
      // once — cache it on the element itself so repeated attach calls
      // for the same element don't throw.
      if (!audioEl._avatarSource) {
        audioEl._avatarSource = this._audioCtx.createMediaElementSource(audioEl);
      }

      this._analyser = this._audioCtx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.smoothingTimeConstant = 0.6;
      this._audioData = new Uint8Array(this._analyser.frequencyBinCount);

      audioEl._avatarSource.connect(this._analyser);
      this._analyser.connect(this._audioCtx.destination);

      this._speaking = true;
    } catch (err) {
      console.warn("AvatarEngine: could not attach audio analyser:", err.message);
      // Still animate the mouth with a gentle synthetic wobble so the
      // avatar doesn't just sit there silently if analysis isn't available.
      this._speaking = true;
    }
  }

  detachAudio() {
    this._speaking = false;
    if (this._analyser) {
      try { this._analyser.disconnect(); } catch (_) { /* already disconnected */ }
      this._analyser = null;
    }
  }

  _updateBlink(dt) {
    if (!this._blinking) {
      this._blinkTimer -= dt;
      if (this._blinkTimer <= 0) {
        this._blinking = true;
        this._blinkPhase = "closing";
        this._blinkProgress = 0;
      }
      return;
    }
    const speed = this._blinkPhase === "closing" ? 0.014 : 0.011;
    if (this._blinkPhase === "closing") {
      this._blinkProgress += dt * speed;
      if (this._blinkProgress >= 1) {
        this._blinkProgress = 1;
        this._blinkPhase = "opening";
      }
    } else {
      this._blinkProgress -= dt * speed;
      if (this._blinkProgress <= 0) {
        this._blinkProgress = 0;
        this._blinking = false;
        this._blinkTimer = this._randomBlinkDelay();
      }
    }
  }

  _updateMouth() {
    if (!this._speaking) {
      this._mouthOpen *= 0.85; // ease back to closed
      return;
    }
    if (this._analyser && this._audioData) {
      this._analyser.getByteFrequencyData(this._audioData);
      let sum = 0;
      for (let i = 0; i < this._audioData.length; i++) sum += this._audioData[i];
      const avg = sum / this._audioData.length / 255; // 0..1
      const target = Math.min(1, avg * 2.2);
      this._mouthOpen += (target - this._mouthOpen) * 0.35;
    } else {
      const wobble = (Math.sin(performance.now() / 90) + 1) / 2;
      this._mouthOpen += (wobble * 0.6 - this._mouthOpen) * 0.3;
    }
  }

  _loop(now) {
    if (!this._running) return;
    const dt = Math.min(64, now - (this._lastFrame || now));
    this._lastFrame = now;

    this._updateBlink(dt);
    this._updateMouth();
    this._draw(now);

    this._rafId = requestAnimationFrame(this._loop);
  }

  /** Draw a single frame. Also used directly for static persona previews. */
  _draw(now) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const t = (now - this._t0) / 1000;
    const sway = Math.sin(t * 0.6) * (w * 0.01);
    const bob = Math.sin(t * 0.9) * (h * 0.006);

    const cx = w / 2 + sway;
    const cy = h / 2 + bob;
    const faceW = w * 0.5;
    const faceH = h * 0.58;

    const { skin, hair, hairStyle, outfit, accent } = this.look;

    // Shoulders / outfit
    ctx.fillStyle = outfit;
    ctx.beginPath();
    ctx.moveTo(cx - faceW * 0.9, h);
    ctx.quadraticCurveTo(cx, h * 0.72, cx + faceW * 0.9, h);
    ctx.fill();

    // Neck
    ctx.fillStyle = skin;
    ctx.fillRect(cx - faceW * 0.14, cy + faceH * 0.32, faceW * 0.28, faceH * 0.3);

    // Head — radial gradient for a touch of depth instead of a flat blob
    const grad = ctx.createRadialGradient(cx - faceW * 0.15, cy - faceH * 0.2, faceW * 0.1, cx, cy, faceW * 0.55);
    grad.addColorStop(0, this._lighten(skin, 12));
    grad.addColorStop(1, this._lighten(skin, -8));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, faceW * 0.42, faceH * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(cx - faceW * 0.42, cy, faceW * 0.06, faceH * 0.1, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + faceW * 0.42, cy, faceW * 0.06, faceH * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    this._drawHair(ctx, cx, cy, faceW, faceH, hair, hairStyle);

    // Eyebrows
    ctx.strokeStyle = hair;
    ctx.lineWidth = Math.max(2, faceW * 0.02);
    ctx.lineCap = "round";
    const browY = cy - faceH * 0.16;
    ctx.beginPath();
    ctx.moveTo(cx - faceW * 0.26, browY);
    ctx.lineTo(cx - faceW * 0.08, browY - faceH * 0.02);
    ctx.moveTo(cx + faceW * 0.08, browY - faceH * 0.02);
    ctx.lineTo(cx + faceW * 0.26, browY);
    ctx.stroke();

    // Eyes — height collapses to ~0 mid-blink
    const eyeOpenH = faceH * 0.06 * (1 - this._blinkProgress);
    this._drawEye(ctx, cx - faceW * 0.17, cy - faceH * 0.05, faceW * 0.09, eyeOpenH, accent);
    this._drawEye(ctx, cx + faceW * 0.17, cy - faceH * 0.05, faceW * 0.09, eyeOpenH, accent);

    // Nose
    ctx.strokeStyle = this._lighten(skin, -20);
    ctx.lineWidth = Math.max(1.5, faceW * 0.012);
    ctx.beginPath();
    ctx.moveTo(cx, cy + faceH * 0.02);
    ctx.lineTo(cx - faceW * 0.03, cy + faceH * 0.14);
    ctx.lineTo(cx + faceW * 0.02, cy + faceH * 0.15);
    ctx.stroke();

    // Mouth — height driven by live audio amplitude when speaking
    this._drawMouth(ctx, cx, cy + faceH * 0.28, faceW, faceH);
  }

  _drawEye(ctx, x, y, rx, ry, accent) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(x, y, rx, Math.max(0.6, ry), 0, 0, Math.PI * 2);
    ctx.fill();
    if (ry > 1) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(x, y, rx * 0.42, Math.min(ry * 0.9, rx * 0.42), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.ellipse(x, y, rx * 0.18, Math.min(ry * 0.5, rx * 0.18), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#33261f";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, Math.max(0.6, ry), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawMouth(ctx, x, y, faceW, faceH) {
    const openH = Math.max(1.5, this._mouthOpen * faceH * 0.09);
    const width = faceW * (0.16 + this._mouthOpen * 0.03);

    ctx.fillStyle = "#7a2e2e";
    ctx.beginPath();
    ctx.ellipse(x, y, width / 2, openH, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this._mouthOpen > 0.15) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(x, y - openH * 0.35, width * 0.42, openH * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#4a1c1c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y, width / 2, openH, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawHair(ctx, cx, cy, faceW, faceH, hair, style) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    if (style === "long") {
      ctx.ellipse(cx, cy - faceH * 0.18, faceW * 0.46, faceH * 0.42, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - faceW * 0.42, cy - faceH * 0.1);
      ctx.quadraticCurveTo(cx - faceW * 0.5, cy + faceH * 0.5, cx - faceW * 0.34, cy + faceH * 0.55);
      ctx.quadraticCurveTo(cx - faceW * 0.4, cy + faceH * 0.1, cx - faceW * 0.36, cy - faceH * 0.05);
      ctx.moveTo(cx + faceW * 0.42, cy - faceH * 0.1);
      ctx.quadraticCurveTo(cx + faceW * 0.5, cy + faceH * 0.5, cx + faceW * 0.34, cy + faceH * 0.55);
      ctx.quadraticCurveTo(cx + faceW * 0.4, cy + faceH * 0.1, cx + faceW * 0.36, cy - faceH * 0.05);
      ctx.fill();
    } else if (style === "curly") {
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx + i * faceW * 0.09, cy - faceH * 0.32, faceW * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.ellipse(cx, cy - faceH * 0.2, faceW * 0.44, faceH * 0.34, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }
  }

  _lighten(hex, amt) {
    const c = hex.replace("#", "");
    const num = parseInt(c, 16);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 0xff) + amt;
    let b = (num & 0xff) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }
}