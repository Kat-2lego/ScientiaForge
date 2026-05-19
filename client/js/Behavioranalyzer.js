/**
 * BehaviorAnalyzer.js
 * Real-time webcam analysis using MediaPipe Face Mesh.
 * Tracks: eye contact ratio, head tilt, blink rate, presence.
 * Loads MediaPipe dynamically (CDN) — no build step required.
 */

export class BehaviorAnalyzer {
  constructor(videoEl, overlayCanvas) {
    this.video   = videoEl;
    this.overlay = overlayCanvas;
    this.ctx     = overlayCanvas.getContext("2d");

    // Stats accumulated over the session
    this.stats = {
      framesAnalyzed:  0,
      eyeContactFrames:0,
      blinkCount:      0,
      headTiltSum:     0,
      presenceFrames:  0,
      fillerWords:     0,  // counted separately from transcript
    };

    this._lastBlink     = false;
    this._faceMesh      = null;
    this._camera        = null;
    this._running       = false;
    this._onReadyCb     = null;
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  /**
   * Load MediaPipe and start camera.
   * Resolves once the first frame has been processed.
   */
  async start() {
    if (this._running) return;

    // Dynamically load MediaPipe face_mesh from CDN
    await this._loadScript(
      "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js"
    );
    await this._loadScript(
      "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"
    );

    const FaceMesh = window.FaceMesh;
    if (!FaceMesh) throw new Error("MediaPipe FaceMesh failed to load");

    this._faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    this._faceMesh.setOptions({
      maxNumFaces:         1,
      refineLandmarks:     true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence:  0.5,
    });

    this._faceMesh.onResults((results) => this._onResults(results));
    await this._faceMesh.initialize();

    // Camera
    const Camera = window.Camera;
    this._camera = new Camera(this.video, {
      onFrame: async () => {
        if (this._faceMesh) await this._faceMesh.send({ image: this.video });
      },
      width:  640,
      height: 480,
    });

    await this._camera.start();
    this._running = true;
  }

  stop() {
    this._running = false;
    if (this._camera) { this._camera.stop(); this._camera = null; }
    if (this._faceMesh) { this._faceMesh.close(); this._faceMesh = null; }
  }

  /**
   * Returns a snapshot of the current session behaviour report.
   */
  getReport() {
    const { framesAnalyzed, eyeContactFrames, blinkCount, headTiltSum, presenceFrames } = this.stats;
    if (framesAnalyzed === 0) return null;

    const eyeContactPct   = Math.round((eyeContactFrames / framesAnalyzed) * 100);
    const avgHeadTilt     = Math.abs(headTiltSum / framesAnalyzed);
    const presencePct     = Math.round((presenceFrames  / framesAnalyzed) * 100);
    const blinkRate       = (blinkCount / (framesAnalyzed / 30)).toFixed(1); // per second at ~30fps

    return {
      eyeContact:  eyeContactPct,   // 0–100 %
      headTilt:    avgHeadTilt,     // radians (< 0.1 = straight)
      presence:    presencePct,     // % of time face was detected
      blinkRate:   parseFloat(blinkRate),
      score:       this._computeBehaviorScore(eyeContactPct, avgHeadTilt, presencePct),
    };
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  _onResults(results) {
    const { overlay, ctx } = this;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    this.stats.framesAnalyzed++;

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

    this.stats.presenceFrames++;
    const lm = results.multiFaceLandmarks[0];

    // Eye contact: check if face is roughly centred and looking forward
    // Use nose tip (1) vs left/right eye centres (468, 473 with refinement)
    const noseTip = lm[1];
    const leftEye = lm[468];
    const rightEye= lm[473];

    const faceX = noseTip.x; // 0 = left edge, 1 = right edge
    const faceY = noseTip.y;

    const isLookingForward =
      Math.abs(faceX - 0.5) < 0.18 &&
      Math.abs(faceY - 0.5) < 0.22;

    if (isLookingForward) this.stats.eyeContactFrames++;

    // Head tilt: angle between left eye and right eye centre
    const dx    = (rightEye.x - leftEye.x);
    const dy    = (rightEye.y - leftEye.y);
    const tilt  = Math.atan2(dy, dx);
    this.stats.headTiltSum += Math.abs(tilt);

    // Blink detection: EAR (eye aspect ratio) approximation
    // Using landmarks 159, 145 (left eye top/bottom) for simplicity
    const earTop = lm[159], earBot = lm[145];
    const ear    = Math.abs(earTop.y - earBot.y);
    const isBlink = ear < 0.008;
    if (isBlink && !this._lastBlink) this.stats.blinkCount++;
    this._lastBlink = isBlink;

    // Draw subtle overlay — green dot when eye contact is good
    if (isLookingForward) {
      ctx.fillStyle   = "rgba(0,200,100,0.7)";
      ctx.beginPath();
      ctx.arc(overlay.width - 18, 18, 7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle   = "rgba(255,100,0,0.7)";
      ctx.beginPath();
      ctx.arc(overlay.width - 18, 18, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _computeBehaviorScore(eyeContact, headTilt, presence) {
    let score = 0;
    score += Math.min(eyeContact, 100) * 0.5;           // 50% weight
    score += Math.max(0, 100 - headTilt * 300) * 0.3;   // 30% weight
    score += presence * 0.2;                             // 20% weight
    return Math.round(Math.min(score, 100));
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s   = document.createElement("script");
      s.src     = src;
      s.onload  = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }
}

// ─── Filler word detector (runs on transcript text) ──────────────────────────

const FILLER_WORDS = [
  "um", "uh", "er", "ah", "like", "you know", "basically",
  "literally", "actually", "so", "right", "kind of", "sort of",
  "i mean", "well", "honestly", "obviously",
];

/**
 * Counts filler words in a transcript string.
 * Returns { count, words: [{word, count}], score: 0–10 }
 */
export function analyzeFillerWords(transcript) {
  const lower   = transcript.toLowerCase();
  const results = [];
  let   total   = 0;

  for (const fw of FILLER_WORDS) {
    const re    = new RegExp(`\\b${fw}\\b`, "g");
    const hits  = (lower.match(re) || []).length;
    if (hits > 0) { results.push({ word: fw, count: hits }); total += hits; }
  }

  results.sort((a, b) => b.count - a.count);

  const wordCount = lower.split(/\s+/).filter(Boolean).length || 1;
  const ratio     = total / wordCount;
  const score     = Math.max(0, Math.round(10 - ratio * 80)); // 10 = no fillers

  return { count: total, words: results, score };
}

/**
 * Check how well an answer follows STAR structure.
 * Looks for signal phrases for each component.
 * Returns { situation, task, action, result, score: 0–10 }
 */
export function analyzeSTAR(transcript) {
  const lower = transcript.toLowerCase();

  const cues = {
    situation: ["when i", "at my", "during", "in my previous", "in my last", "we had", "there was", "the situation"],
    task:      ["i was responsible", "my role was", "i needed to", "i had to", "the task", "my job was", "i was asked"],
    action:    ["i decided", "i took", "i implemented", "i collaborated", "i built", "i led", "what i did", "my approach", "i reached out", "i created"],
    result:    ["as a result", "this led to", "the outcome", "we achieved", "it resulted", "the impact", "we increased", "we reduced", "ultimately"],
  };

  const found = {};
  let total = 0;
  for (const [key, phrases] of Object.entries(cues)) {
    found[key] = phrases.some((p) => lower.includes(p));
    if (found[key]) total++;
  }

  return {
    ...found,
    score: Math.round((total / 4) * 10),
    completeness: `${total}/4 components`,
  };
}