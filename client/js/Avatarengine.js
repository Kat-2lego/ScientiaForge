/**
 * AvatarEngine.js
 * Renders a realistic animated interviewer avatar on a <canvas> element.
 * - Draws a portrait from a pre-defined palette of SVG/canvas personas
 * - Analyses audio amplitude in real-time to drive mouth-open visemes
 * - Simulates eye-contact: eyes occasionally blink and shift gaze toward the user
 * - No external API required — pure Web Audio + Canvas 2D
 */

export class AvatarEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {string} personaId  — matches keys in PERSONAS
   */
  constructor(canvas, personaId = "senior-engineer") {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext("2d");
    this.persona = PERSONAS[personaId] || PERSONAS["hr-manager"];

    // Lipsync state
    this.mouthOpen    = 0;      // 0–1
    this.targetMouth  = 0;
    this.audioCtx     = null;
    this.analyser     = null;
    this.dataArray    = null;
    this.sourceNode   = null;

    // Eye / gaze state
    this.blinkProgress  = 0;    // 0 = open, 1 = closed
    this.blinkTarget    = 0;
    this.gazeX          = 0;    // –1 to +1
    this.gazeY          = 0;
    this.nextBlinkAt    = Date.now() + this._randomBlink();
    this.nextGazeAt     = Date.now() + 2000;

    // Idle breathing
    this.breathPhase = 0;

    this._raf = null;
    this._running = false;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  start() {
    if (this._running) return;
    this._running = true;
    this._loop();
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._detachAudio();
  }

  /**
   * Feed an HTMLAudioElement so the avatar lipsyncs to it.
   * Call before audio.play().
   */
  attachAudio(audioEl) {
    this._detachAudio();
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      this.analyser              = this.audioCtx.createAnalyser();
      this.analyser.fftSize      = 256;
      this.analyser.smoothingTimeConstant = 0.6;
      this.dataArray             = new Uint8Array(this.analyser.frequencyBinCount);
      this.sourceNode            = this.audioCtx.createMediaElementSource(audioEl);
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    } catch (e) {
      console.warn("[Avatar] Audio attach failed:", e.message);
    }
  }

  detachAudio() {
    this._detachAudio();
    this.mouthOpen   = 0;
    this.targetMouth = 0;
  }

  switchPersona(personaId) {
    this.persona = PERSONAS[personaId] || PERSONAS["hr-manager"];
  }

  // ─── Internal loop ───────────────────────────────────────────────────────

  _loop() {
    if (!this._running) return;
    this._raf = requestAnimationFrame(() => this._loop());

    const now = Date.now();

    // Lipsync from audio
    this._updateMouth();

    // Blink
    if (now >= this.nextBlinkAt) {
      this.blinkTarget  = 1;
      this.nextBlinkAt  = now + this._randomBlink();
    }
    this.blinkProgress += (this.blinkTarget - this.blinkProgress) * 0.25;
    if (this.blinkProgress > 0.9 && this.blinkTarget === 1) {
      this.blinkTarget = 0;
    }

    // Gaze shift
    if (now >= this.nextGazeAt) {
      // Bias toward center (looking at user) 70% of time
      this.gazeX     = Math.random() < 0.7 ? 0 : (Math.random() - 0.5) * 0.4;
      this.gazeY     = Math.random() < 0.7 ? 0 : (Math.random() - 0.5) * 0.3;
      this.nextGazeAt = now + 1500 + Math.random() * 2500;
    }

    // Breathing
    this.breathPhase = (this.breathPhase + 0.015) % (Math.PI * 2);
    const breathY    = Math.sin(this.breathPhase) * 1.5;

    this._draw(breathY);
  }

  _updateMouth() {
    if (!this.analyser) {
      // Decay to closed when no audio
      this.mouthOpen += (0 - this.mouthOpen) * 0.12;
      return;
    }
    this.analyser.getByteFrequencyData(this.dataArray);
    // Focus on speech frequencies (roughly 200–3000 Hz with fftSize=256 at 44.1 kHz)
    const lo = 3, hi = 20;
    let sum = 0;
    for (let i = lo; i <= hi; i++) sum += this.dataArray[i];
    const avg        = sum / (hi - lo + 1);
    this.targetMouth = Math.min(avg / 80, 1);
    this.mouthOpen  += (this.targetMouth - this.mouthOpen) * 0.3;
  }

  _detachAudio() {
    try {
      if (this.sourceNode) { this.sourceNode.disconnect(); this.sourceNode = null; }
      if (this.analyser)   { this.analyser.disconnect();   this.analyser   = null; }
    } catch (_) {}
    this.dataArray = null;
  }

  _randomBlink() { return 2000 + Math.random() * 4000; }

  // ─── Drawing ─────────────────────────────────────────────────────────────

  _draw(breathY = 0) {
    const { canvas, ctx, persona } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2 + breathY;

    this._drawBackground(ctx, W, H, persona);
    this._drawShoulder(ctx, cx, cy, W, H, persona);
    this._drawNeck(ctx, cx, cy, persona);
    this._drawHead(ctx, cx, cy, persona);
    this._drawHair(ctx, cx, cy, persona);
    this._drawEyes(ctx, cx, cy, persona);
    this._drawNose(ctx, cx, cy, persona);
    this._drawMouth(ctx, cx, cy, persona);
    if (persona.hasEarring) this._drawEarrings(ctx, cx, cy, persona);
    if (persona.hasGlasses) this._drawGlasses(ctx, cx, cy, persona);
  }

  _drawBackground(ctx, W, H, p) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, p.bgTop);
    grad.addColorStop(1, p.bgBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  _drawShoulder(ctx, cx, cy, W, H, p) {
    ctx.fillStyle = p.clothColor;
    ctx.beginPath();
    ctx.ellipse(cx, H * 0.95, W * 0.48, H * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    // Collar
    ctx.fillStyle = p.collarColor || "#fff";
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy + 68);
    ctx.lineTo(cx, cy + 55);
    ctx.lineTo(cx + 22, cy + 68);
    ctx.lineTo(cx + 14, cy + 85);
    ctx.lineTo(cx, cy + 75);
    ctx.lineTo(cx - 14, cy + 85);
    ctx.closePath();
    ctx.fill();
  }

  _drawNeck(ctx, cx, cy, p) {
    ctx.fillStyle = p.skinMid;
    ctx.beginPath();
    ctx.roundRect(cx - 14, cy + 42, 28, 32, 6);
    ctx.fill();
  }

  _drawHead(ctx, cx, cy, p) {
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.beginPath();
    ctx.ellipse(cx + 4, cy + 6, 60, 70, 0, 0, Math.PI * 2);
    ctx.fill();

    // Face
    const faceGrad = ctx.createRadialGradient(cx - 10, cy - 15, 5, cx, cy, 65);
    faceGrad.addColorStop(0, p.skinHi);
    faceGrad.addColorStop(1, p.skinMid);
    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 60, 70, 0, 0, Math.PI * 2);
    ctx.fill();

    // Jaw shading
    ctx.fillStyle = p.skinShadow;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 35, 42, 25, 0, 0, Math.PI);
    ctx.fill();
  }

  _drawHair(ctx, cx, cy, p) {
    ctx.fillStyle = p.hairColor;
    // Top hair
    ctx.beginPath();
    ctx.ellipse(cx, cy - 40, 60, 38, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Side hair
    ctx.beginPath();
    ctx.ellipse(cx - 52, cy - 10, 14, 30, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 52, cy - 10, 14, 30, 0.2, 0, Math.PI * 2);
    ctx.fill();
    // Hair detail line
    if (p.hairLine) {
      ctx.strokeStyle = p.hairLineDark || "rgba(0,0,0,0.15)";
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy - 68);
      ctx.quadraticCurveTo(cx, cy - 76, cx + 10, cy - 65);
      ctx.stroke();
    }
  }

  _drawEyes(ctx, cx, cy, p) {
    const blink = this.blinkProgress;
    const gx    = this.gazeX * 4;
    const gy    = this.gazeY * 3;

    for (const side of [-1, 1]) {
      const ex = cx + side * 22;
      const ey = cy - 12;

      // Eyebrow
      ctx.strokeStyle = p.hairColor;
      ctx.lineWidth   = 3;
      ctx.lineCap     = "round";
      ctx.beginPath();
      ctx.moveTo(ex - 13, ey - 20);
      ctx.quadraticCurveTo(ex, ey - 24, ex + 13, ey - 20);
      ctx.stroke();

      // Eye white
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(ex, ey, 13, 9 * (1 - blink * 0.9), 0, 0, Math.PI * 2);
      ctx.fill();

      if (blink < 0.5) {
        // Iris
        ctx.fillStyle = p.irisColor;
        ctx.beginPath();
        ctx.ellipse(ex + gx, ey + gy, 7, 7 * (1 - blink), 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupil
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.ellipse(ex + gx, ey + gy, 3.5, 3.5 * (1 - blink), 0, 0, Math.PI * 2);
        ctx.fill();

        // Specular
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.ellipse(ex + gx + 2, ey + gy - 2, 2, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Eyelid (blink)
      ctx.fillStyle = p.skinMid;
      ctx.beginPath();
      ctx.ellipse(ex, ey - 4, 14, 10 * blink + 1, 0, 0, Math.PI * 2);
      ctx.fill();

      // Lower lash line
      ctx.strokeStyle = p.skinShadow;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.ellipse(ex, ey + 4, 13, 4, 0, 0, Math.PI);
      ctx.stroke();
    }
  }

  _drawNose(ctx, cx, cy, p) {
    ctx.strokeStyle = p.skinShadow;
    ctx.lineWidth   = 1.5;
    ctx.lineCap     = "round";
    // Bridge
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.quadraticCurveTo(cx + 5, cy + 8, cx + 2, cy + 14);
    ctx.stroke();
    // Nostrils
    ctx.beginPath();
    ctx.ellipse(cx - 7, cy + 16, 5, 3, -0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx + 7, cy + 16, 5, 3, 0.3, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawMouth(ctx, cx, cy, p) {
    const open = this.mouthOpen;
    const my   = cy + 34;

    // Lips
    ctx.fillStyle = p.lipColor;
    ctx.beginPath();
    // Upper lip
    ctx.moveTo(cx - 20, my);
    ctx.quadraticCurveTo(cx - 10, my - 5, cx, my - 3);
    ctx.quadraticCurveTo(cx + 10,  my - 5, cx + 20, my);
    // Lower lip
    ctx.quadraticCurveTo(cx + 12, my + 8 + open * 16, cx, my + 10 + open * 18);
    ctx.quadraticCurveTo(cx - 12, my + 8 + open * 16, cx - 20, my);
    ctx.fill();

    // Mouth opening (teeth visible when open)
    if (open > 0.1) {
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.ellipse(cx, my + 5 + open * 6, 14 * open, 5 * open, 0, 0, Math.PI * 2);
      ctx.fill();

      if (open > 0.25) {
        ctx.fillStyle = "#f5f0eb";
        ctx.beginPath();
        ctx.ellipse(cx, my + 4 + open * 4, 10 * open, 3 * open, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Lip line
    ctx.strokeStyle = p.lipDark;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 20, my);
    ctx.quadraticCurveTo(cx, my - 3, cx + 20, my);
    ctx.stroke();

    // Smile lines
    ctx.strokeStyle = p.skinShadow;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 22, my - 4);
    ctx.quadraticCurveTo(cx - 26, my + 8, cx - 20, my + 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 22, my - 4);
    ctx.quadraticCurveTo(cx + 26, my + 8, cx + 20, my + 14);
    ctx.stroke();
  }

  _drawGlasses(ctx, cx, cy, p) {
    ctx.strokeStyle = p.glassColor || "#4a3728";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    const ey        = cy - 12;

    for (const side of [-1, 1]) {
      const ex = cx + side * 22;
      ctx.beginPath();
      ctx.roundRect(ex - 16, ey - 12, 32, 22, 6);
      ctx.stroke();
    }
    // Bridge
    ctx.beginPath();
    ctx.moveTo(cx - 6, ey - 4);
    ctx.lineTo(cx + 6, ey - 4);
    ctx.stroke();
    // Arms
    ctx.beginPath();
    ctx.moveTo(cx - 38, ey - 4);
    ctx.lineTo(cx - 62, ey - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 38, ey - 4);
    ctx.lineTo(cx + 62, ey - 2);
    ctx.stroke();
  }

  _drawEarrings(ctx, cx, cy, p) {
    for (const side of [-1, 1]) {
      const ex = cx + side * 60;
      ctx.fillStyle   = p.earringColor || "#e5c200";
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.ellipse(ex, cy + 10, 5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

// ─── Persona definitions ─────────────────────────────────────────────────────

const PERSONAS = {
  "senior-engineer": {
    // Alex Chen — East Asian male, dark hair, navy shirt
    skinHi:     "#f5cba7",
    skinMid:    "#e8a87c",
    skinShadow: "#c47c52",
    hairColor:  "#1a1a1a",
    hairLine:   true,
    irisColor:  "#3d2b1f",
    lipColor:   "#c47c5c",
    lipDark:    "#a0543a",
    clothColor: "#1a2a4a",
    collarColor:"#e8e8e8",
    bgTop:      "#1a2a4a",
    bgBot:      "#0d1520",
    hasGlasses: true,
    glassColor: "#2c2c2c",
    hasEarring: false,
  },
  "hr-manager": {
    // Sarah Okafor — West African female, black hair, coral blazer
    skinHi:     "#8b5a2b",
    skinMid:    "#6b3a1f",
    skinShadow: "#4a2412",
    hairColor:  "#0d0d0d",
    hairLine:   false,
    irisColor:  "#2d1a0e",
    lipColor:   "#c0392b",
    lipDark:    "#922b21",
    clothColor: "#c0392b",
    collarColor:"#f9ebea",
    bgTop:      "#2c1a0e",
    bgBot:      "#1a0d07",
    hasGlasses: false,
    hasEarring: true,
    earringColor:"#f0c040",
  },
  "product-manager": {
    // Jordan Lee — Mixed / light skin, dark brown hair, teal polo
    skinHi:     "#ffe0c4",
    skinMid:    "#d4a07a",
    skinShadow: "#a07050",
    hairColor:  "#3d2b1f",
    hairLine:   true,
    irisColor:  "#2e6da4",
    lipColor:   "#c08070",
    lipDark:    "#a06050",
    clothColor: "#1a7a6a",
    collarColor:"#eafaf8",
    bgTop:      "#0d3d35",
    bgBot:      "#061e1a",
    hasGlasses: false,
    hasEarring: false,
  },
  "consultant": {
    // Priya Naidoo — South Asian female, black hair, deep purple blazer
    skinHi:     "#e8c4a0",
    skinMid:    "#c49070",
    skinShadow: "#8a5a38",
    hairColor:  "#0d0d0d",
    hairLine:   false,
    irisColor:  "#1a0d00",
    lipColor:   "#8b1a4a",
    lipDark:    "#6a1038",
    clothColor: "#4a1070",
    collarColor:"#f8eaff",
    bgTop:      "#2a0a40",
    bgBot:      "#150520",
    hasGlasses: false,
    hasEarring: true,
    earringColor:"#c0a000",
  },
};