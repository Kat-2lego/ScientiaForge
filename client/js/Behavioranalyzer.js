/**
 * BehaviorAnalyzer.js  (v3 — accuracy + integrity signals)
 * Real-time webcam analysis using MediaPipe Face Mesh + MediaPipe Object
 * Detector. Tracks: eye contact (self-calibrated, not a fixed frame-center
 * guess), head tilt, blink rate, presence — plus integrity signals: a
 * phone-like object visible in frame, more than one face visible, extended
 * absence from camera, and sustained downward gaze.
 *
 * IMPORTANT — read this before wiring up the report UI:
 * The integrity signals here are heuristics running on a single 2D webcam
 * feed. They are genuinely useful *signals* (a phone detected by an actual
 * object-detection model is strong evidence; a person's face pitching down
 * for 4+ seconds is a much softer one) but none of them are proof of
 * cheating on their own — reading printed notes, adjusting posture, or a
 * sibling walking past the camera can all trigger a signal. Report these
 * as observations for a human to weigh, never as an automatic verdict.
 *
 * What changed vs. the previous version:
 *  - Eye contact now self-calibrates against the candidate's own face
 *    position and gaze in the first ~1.5s, instead of assuming they sit
 *    dead-center in frame. Different webcam heights/seating positions made
 *    the old fixed-0.5 threshold wrong for most people.
 *  - Away-from-camera and looking-down states now require a sustained
 *    duration before they're counted as an "episode" — a single noisy
 *    frame or a quick glance at your own notes no longer skews the report.
 *  - New: actual phone detection via MediaPipe's Object Detector (COCO
 *    "cell phone" class), not a guess based on hand position.
 *  - New: multiple-face detection (a second person in frame).
 *  - New: extended-absence and sustained-downward-gaze episode logging.
 *  - Loads MediaPipe dynamically (CDN) — no build step required. The
 *    object detector is best-effort: if it fails to load (e.g. blocked
 *    network), everything else keeps working without it.
 */

// Standard 6-point EAR landmark sets for MediaPipe Face Mesh (468-point model)
const RIGHT_EYE_EAR = [33, 160, 158, 133, 153, 144]; // p1..p6
const LEFT_EYE_EAR  = [362, 385, 387, 263, 373, 380]; // p1..p6

// Eye corner landmarks used for gaze-ratio (iris position within the socket)
const RIGHT_EYE_CORNERS = [33, 133]; // outer, inner
const LEFT_EYE_CORNERS  = [263, 362]; // outer, inner

// Iris centers (only present when refineLandmarks: true)
const RIGHT_IRIS = 468;
const LEFT_IRIS  = 473;

// Forehead / chin approximations for the (coarse) downward-gaze proxy
const FOREHEAD_LM = 10;
const CHIN_LM = 152;

const OBJECT_DETECTOR_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";
const TASKS_VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2";

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function eyeAspectRatio(lm, idx) {
  const [p1, p2, p3, p4, p5, p6] = idx.map((i) => lm[i]);
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return null;
  const vertical = dist(p2, p6) + dist(p3, p5);
  const horizontal = 2 * dist(p1, p4);
  if (horizontal === 0) return null;
  return vertical / horizontal;
}

// 0 = looking at the outer corner, 1 = looking at the inner corner,
// ~0.5 = centred within the socket.
function gazeRatio(lm, corners, irisIdx) {
  const outer = lm[corners[0]];
  const inner = lm[corners[1]];
  const iris = lm[irisIdx];
  if (!outer || !inner || !iris) return null;
  const span = inner.x - outer.x;
  if (span === 0) return null;
  return (iris.x - outer.x) / span;
}

class Ema {
  constructor(alpha = 0.25) {
    this.alpha = alpha;
    this.value = null;
  }
  push(x) {
    if (x === null || Number.isNaN(x)) return this.value;
    this.value = this.value === null ? x : this.alpha * x + (1 - this.alpha) * this.value;
    return this.value;
  }
}

export class BehaviorAnalyzer {
  constructor(videoEl, overlayCanvas) {
    this.video = videoEl;
    this.overlay = overlayCanvas;
    this.ctx = overlayCanvas.getContext("2d");

    this.stats = {
      framesAnalyzed: 0,
      eyeContactFrames: 0,
      blinkCount: 0,
      headTiltSum: 0,
      presenceFrames: 0,
      multiFaceFrames: 0,
      phoneFrames: 0,
      extendedAwayEpisodes: 0,
    };

    // Timestamped, human-readable integrity signals — surfaced separately
    // from the main behaviour score (see class comment above).
    this.integrityEvents = [];

    // Smoothing
    this._earEma = new Ema(0.4);
    this._tiltEma = new Ema(0.3);
    this._gazeEma = new Ema(0.3);
    this._pitchEma = new Ema(0.3);

    // Blink calibration (self-learned "eyes open" baseline)
    this._calibrationFrames = [];
    this._calibratedOpenEar = null;
    this._blinkThreshold = null;
    this._eyeWasClosed = false;

    // Attention calibration (self-learned "looking at the screen" baseline
    // — fixes eye-contact accuracy across different webcam/seating setups)
    this._attentionCalibrationFrames = [];
    this._calibratedNose = null;
    this._calibratedGaze = null;
    this._calibratedPitchRatio = null;

    // Sustained-state trackers (avoid flagging single noisy frames)
    this._awayStreakStart = null;
    this._awayStreakLogged = false;
    this._absenceStreakStart = null;
    this._absenceStreakLogged = false;
    this._downwardStreakStart = null;
    this._downwardStreakLogged = false;
    this._multiFaceStreakStart = null;
    this._multiFaceStreakLogged = false;
    this._phoneStreakStart = null;
    this._phoneStreakLogged = false;

    // Live indicator state (drawn on the overlay canvas)
    this._phoneActiveNow = false;
    this._multiFaceActiveNow = false;

    this._faceMesh = null;
    this._camera = null;
    this._objectDetector = null;
    this._lastObjectDetectAt = 0;
    this._running = false;
    this._resizeObserved = false;
    this._startedAt = null;
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  async start() {
    if (this._running) return;

    this._startedAt = performance.now();

    await Promise.race([
      this._loadMediaPipeScripts(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timed out loading face-tracking library.")), 15000)
      ),
    ]);

    const FaceMesh = window.FaceMesh;
    if (!FaceMesh) throw new Error("MediaPipe FaceMesh failed to load.");

    this._faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    this._faceMesh.setOptions({
      // Track up to 2 faces — not because we want two candidates, but so we
      // can detect and flag when a second person enters frame.
      maxNumFaces: 2,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this._faceMesh.onResults((results) => {
      try {
        this._onResults(results);
      } catch (err) {
        console.warn("BehaviorAnalyzer: frame processing error:", err.message);
      }
    });

    await this._faceMesh.initialize();

    // Best-effort — the interview still works fully without phone detection
    // if this fails to load (e.g. blocked network, no WebGL).
    await this._loadObjectDetector();

    if (!this._resizeObserved) {
      this.video.addEventListener("loadedmetadata", () => this._syncCanvasSize());
      this._resizeObserved = true;
    }
    this._syncCanvasSize();

    const Camera = window.Camera;
    this._camera = new Camera(this.video, {
      onFrame: async () => {
        if (this._faceMesh) await this._faceMesh.send({ image: this.video });
        this._maybeRunObjectDetection();
      },
      width: 640,
      height: 480,
    });

    await this._camera.start();
    this._running = true;
  }

  stop() {
    this._running = false;
    if (this._camera) {
      this._camera.stop();
      this._camera = null;
    }
    if (this._faceMesh) {
      this._faceMesh.close();
      this._faceMesh = null;
    }
    if (this._objectDetector) {
      try {
        this._objectDetector.close();
      } catch (_) { /* already closed */ }
      this._objectDetector = null;
    }
    if (this.ctx) this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  /**
   * Returns a snapshot of the current session behaviour + integrity report,
   * or null if no usable data was collected.
   */
  getReport() {
    const {
      framesAnalyzed,
      eyeContactFrames,
      blinkCount,
      headTiltSum,
      presenceFrames,
      extendedAwayEpisodes,
    } = this.stats;

    if (framesAnalyzed === 0 || presenceFrames === 0) return null;

    const eyeContactPct = Math.round((eyeContactFrames / framesAnalyzed) * 100);
    const avgHeadTilt = Math.abs(headTiltSum / framesAnalyzed);
    const presencePct = Math.round((presenceFrames / framesAnalyzed) * 100);
    const blinkRate = Number((blinkCount / (framesAnalyzed / 30 / 60)).toFixed(1)); // per minute

    const phoneEvents = this.integrityEvents.filter((e) => e.type === "phone_detected");
    const multiFaceEvents = this.integrityEvents.filter((e) => e.type === "multiple_faces");
    const absenceEvents = this.integrityEvents.filter((e) => e.type === "no_face_detected");
    const downwardEvents = this.integrityEvents.filter((e) => e.type === "sustained_downward_gaze");

    return {
      eyeContact: eyeContactPct, // 0–100 %, self-calibrated
      headTilt: avgHeadTilt, // radians (~0 = level)
      presence: presencePct, // % of time a face was detected
      blinkRate, // blinks per minute
      extendedLookAwayEpisodes: extendedAwayEpisodes, // sustained (>1.5s) glances away
      score: this._computeBehaviorScore(eyeContactPct, avgHeadTilt, presencePct, blinkRate),

      // Integrity signals — see the class-level comment: these are
      // observations for a human to weigh, not an automated verdict.
      integrity: {
        flagged: phoneEvents.length > 0 || multiFaceEvents.length > 0,
        phoneDetectedEvents: phoneEvents.length,
        multipleFacesEvents: multiFaceEvents.length,
        awayFromCameraEvents: absenceEvents.length,
        sustainedDownwardGazeEvents: downwardEvents.length,
        log: this.integrityEvents.map((e) => ({ ...e })),
      },
    };
  }

  // ─── Internal: setup ──────────────────────────────────────────────────────

  _syncCanvasSize() {
    const w = this.video.videoWidth || this.overlay.width;
    const h = this.video.videoHeight || this.overlay.height;
    if (w && h && (this.overlay.width !== w || this.overlay.height !== h)) {
      this.overlay.width = w;
      this.overlay.height = h;
    }
  }

  async _loadObjectDetector() {
    try {
      const { ObjectDetector, FilesetResolver } = await import(TASKS_VISION_CDN);
      const vision = await FilesetResolver.forVisionTasks(`${TASKS_VISION_CDN}/wasm`);

      try {
        this._objectDetector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: OBJECT_DETECTOR_MODEL_URL, delegate: "GPU" },
          scoreThreshold: 0.5,
          runningMode: "VIDEO",
        });
      } catch (gpuErr) {
        console.warn(
          "BehaviorAnalyzer: GPU delegate unavailable for object detection, trying CPU:",
          gpuErr.message
        );
        this._objectDetector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: OBJECT_DETECTOR_MODEL_URL, delegate: "CPU" },
          scoreThreshold: 0.5,
          runningMode: "VIDEO",
        });
      }
    } catch (err) {
      console.warn("BehaviorAnalyzer: phone/object detection unavailable:", err.message);
      this._objectDetector = null;
    }
  }

  _elapsedSeconds() {
    return Math.round((performance.now() - this._startedAt) / 1000);
  }

  // ─── Internal: object (phone) detection — throttled to ~1x/second ────────

  _maybeRunObjectDetection() {
    if (!this._objectDetector) return;
    const now = performance.now();
    if (now - this._lastObjectDetectAt < 1000) return;
    this._lastObjectDetectAt = now;

    try {
      const result = this._objectDetector.detectForVideo(this.video, now);
      this._handleObjectDetectionResult(result);
    } catch (err) {
      // Non-fatal — just skip this detection cycle.
    }
  }

  _handleObjectDetectionResult(result) {
    const detections = result?.detections || [];
    const phoneDetection = detections.find((d) =>
      (d.categories || []).some((c) => c.categoryName === "cell phone" && c.score >= 0.5)
    );

    this._phoneActiveNow = !!phoneDetection;

    const now = performance.now();
    if (phoneDetection) {
      this.stats.phoneFrames++;
      if (this._phoneStreakStart === null) this._phoneStreakStart = now;
      if (!this._phoneStreakLogged && now - this._phoneStreakStart > 1200) {
        this.integrityEvents.push({
          type: "phone_detected",
          atSeconds: this._elapsedSeconds(),
          detail: "A phone-like object was visible in frame.",
        });
        this._phoneStreakLogged = true;
      }
    } else {
      this._phoneStreakStart = null;
      this._phoneStreakLogged = false;
    }
  }

  // ─── Internal: sustained-episode helpers ──────────────────────────────────

  _trackMultiFace(faceCount) {
    const now = performance.now();
    this._multiFaceActiveNow = faceCount > 1;

    if (faceCount > 1) {
      this.stats.multiFaceFrames++;
      if (this._multiFaceStreakStart === null) this._multiFaceStreakStart = now;
      if (!this._multiFaceStreakLogged && now - this._multiFaceStreakStart > 1000) {
        this.integrityEvents.push({
          type: "multiple_faces",
          atSeconds: this._elapsedSeconds(),
          detail: "More than one face was visible in frame.",
        });
        this._multiFaceStreakLogged = true;
      }
    } else {
      this._multiFaceStreakStart = null;
      this._multiFaceStreakLogged = false;
    }
  }

  _trackAbsence(isAbsent) {
    const now = performance.now();
    if (isAbsent) {
      if (this._absenceStreakStart === null) this._absenceStreakStart = now;
      if (!this._absenceStreakLogged && now - this._absenceStreakStart > 2500) {
        this.integrityEvents.push({
          type: "no_face_detected",
          atSeconds: this._elapsedSeconds(),
          detail: "No face was visible for an extended period.",
        });
        this._absenceStreakLogged = true;
      }
    } else {
      this._absenceStreakStart = null;
      this._absenceStreakLogged = false;
    }
  }

  _trackAwayStreak(isAway) {
    const now = performance.now();
    if (isAway) {
      if (this._awayStreakStart === null) this._awayStreakStart = now;
      if (!this._awayStreakLogged && now - this._awayStreakStart > 1500) {
        this.stats.extendedAwayEpisodes++;
        this._awayStreakLogged = true;
      }
    } else {
      this._awayStreakStart = null;
      this._awayStreakLogged = false;
    }
  }

  _trackDownwardStreak(isDown) {
    const now = performance.now();
    if (isDown) {
      if (this._downwardStreakStart === null) this._downwardStreakStart = now;
      if (!this._downwardStreakLogged && now - this._downwardStreakStart > 4000) {
        this.integrityEvents.push({
          type: "sustained_downward_gaze",
          atSeconds: this._elapsedSeconds(),
          detail: "Extended time looking down and away from the screen (could be notes — treat as a soft signal, not confirmation).",
        });
        this._downwardStreakLogged = true;
      }
    } else {
      this._downwardStreakStart = null;
      this._downwardStreakLogged = false;
    }
  }

  // ─── Internal: per-frame processing ──────────────────────────────────────

  _onResults(results) {
    const { overlay, ctx } = this;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    this.stats.framesAnalyzed++;

    const faces = results.multiFaceLandmarks || [];
    this._trackMultiFace(faces.length);

    if (faces.length === 0) {
      this._trackAbsence(true);
      return;
    }
    this._trackAbsence(false);
    this.stats.presenceFrames++;

    const lm = faces[0];
    const noseTip = lm[1];
    const leftIris = lm[LEFT_IRIS];
    const rightIris = lm[RIGHT_IRIS];
    const forehead = lm[FOREHEAD_LM];
    const chin = lm[CHIN_LM];

    // ── Gaze (iris position within the eye socket) ──────────────────────
    const gazeR = gazeRatio(lm, RIGHT_EYE_CORNERS, RIGHT_IRIS);
    const gazeL = gazeRatio(lm, LEFT_EYE_CORNERS, LEFT_IRIS);
    const gazeAvgRaw =
      gazeR !== null && gazeL !== null ? (gazeR + gazeL) / 2 : gazeR !== null ? gazeR : gazeL;
    const smoothedGaze = this._gazeEma.push(gazeAvgRaw);

    // ── Downward-gaze proxy (coarse — see class comment) ────────────────
    let pitchRatioRaw = null;
    if (forehead && chin && noseTip && leftIris && rightIris) {
      const eyeY = (leftIris.y + rightIris.y) / 2;
      const upper = Math.max(0.001, eyeY - forehead.y);
      const lower = Math.max(0.001, chin.y - eyeY);
      pitchRatioRaw = upper / lower; // shrinks as the head pitches downward
    }
    const smoothedPitchRatio = this._pitchEma.push(pitchRatioRaw);

    // ── Attention calibration — learn this person's own "looking at the
    // screen" baseline over the first ~45 frames (~1.5s) rather than
    // assuming everyone sits dead-center in frame. ──────────────────────
    if (this._calibratedNose === null && noseTip) {
      this._attentionCalibrationFrames.push({
        x: noseTip.x,
        y: noseTip.y,
        gaze: smoothedGaze,
        pitch: smoothedPitchRatio,
      });

      if (this._attentionCalibrationFrames.length >= 45) {
        const n = this._attentionCalibrationFrames.length;
        const avg = (key) =>
          this._attentionCalibrationFrames.reduce((sum, f) => sum + (f[key] ?? 0), 0) / n;

        this._calibratedNose = { x: avg("x"), y: avg("y") };
        this._calibratedGaze = avg("gaze");
        this._calibratedPitchRatio = avg("pitch");
      }
    }

    const calibrated = this._calibratedNose !== null;
    const noseBaseline = calibrated ? this._calibratedNose : { x: 0.5, y: 0.5 };
    const gazeBaseline = calibrated ? this._calibratedGaze : 0.5;

    // ── Head tilt (roll) ──────────────────────────────────────────────
    let tilt = 0;
    if (leftIris && rightIris) {
      tilt = Math.atan2(rightIris.y - leftIris.y, rightIris.x - leftIris.x);
    }
    const smoothedTilt = this._tiltEma.push(tilt) ?? tilt;
    this.stats.headTiltSum += Math.abs(smoothedTilt);

    // ── Eye contact — calibrated head position + calibrated gaze ────────
    const headCentred =
      Math.abs(noseTip.x - noseBaseline.x) < 0.16 && Math.abs(noseTip.y - noseBaseline.y) < 0.18;
    const gazeCentred = smoothedGaze === null ? true : Math.abs(smoothedGaze - gazeBaseline) < 0.16;
    const lookingAtCamera = headCentred && gazeCentred && Math.abs(smoothedTilt) < 0.35;

    if (calibrated) {
      if (lookingAtCamera) this.stats.eyeContactFrames++;
      this._trackAwayStreak(!lookingAtCamera);
    } else {
      // Don't penalise the brief calibration window itself.
      this.stats.eyeContactFrames++;
    }

    // ── Sustained downward gaze ──────────────────────────────────────────
    if (calibrated && this._calibratedPitchRatio && smoothedPitchRatio !== null) {
      const isLookingDown = smoothedPitchRatio < this._calibratedPitchRatio * 0.62;
      this._trackDownwardStreak(isLookingDown);
    }

    // ── Blink detection via EAR, self-calibrated ─────────────────────────
    const earRight = eyeAspectRatio(lm, RIGHT_EYE_EAR);
    const earLeft = eyeAspectRatio(lm, LEFT_EYE_EAR);
    const validEars = [earRight, earLeft].filter((v) => v !== null);
    if (validEars.length) {
      const earRaw = validEars.reduce((a, b) => a + b, 0) / validEars.length;
      const ear = this._earEma.push(earRaw);

      if (this._calibratedOpenEar === null) {
        this._calibrationFrames.push(ear);
        if (this._calibrationFrames.length >= 30) {
          const baseline = this._calibrationFrames.reduce((a, b) => a + b, 0) / this._calibrationFrames.length;
          this._calibratedOpenEar = baseline;
          this._blinkThreshold = baseline * 0.72;
        }
      } else {
        const isClosed = ear < this._blinkThreshold;
        if (isClosed && !this._eyeWasClosed) this.stats.blinkCount++;
        this._eyeWasClosed = isClosed;
      }
    }

    // ── Overlay ───────────────────────────────────────────────────────────
    ctx.fillStyle = lookingAtCamera ? "rgba(0,200,100,0.7)" : "rgba(255,100,0,0.7)";
    ctx.beginPath();
    ctx.arc(overlay.width - 18, 18, 7, 0, Math.PI * 2);
    ctx.fill();

    if (this._phoneActiveNow || this._multiFaceActiveNow) {
      const label = this._phoneActiveNow ? "possible phone in frame" : "multiple faces in frame";
      ctx.fillStyle = "rgba(220,38,38,0.9)";
      ctx.font = `${Math.max(11, Math.round(overlay.width * 0.035))}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(`⚠ ${label}`, 10, overlay.height - 12);
    }
  }

  _computeBehaviorScore(eyeContact, headTilt, presence, blinkRate) {
    let score = 0;
    score += Math.min(eyeContact, 100) * 0.5; // 50% weight
    score += Math.max(0, 100 - headTilt * 300) * 0.25; // 25% weight
    score += presence * 0.15; // 15% weight

    // Healthy blink rate for an attentive, non-anxious speaker is roughly
    // 12-25 blinks/min. Very low or very high both count slightly against.
    const blinkHealth = blinkRate >= 10 && blinkRate <= 30 ? 100 : Math.max(0, 100 - Math.abs(blinkRate - 18) * 4);
    score += blinkHealth * 0.1; // 10% weight

    return Math.round(Math.min(score, 100));
  }

  _loadMediaPipeScripts() {
    return Promise.all([
      this._loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js"),
      this._loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"),
    ]);
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }
}

// ─── Filler word detector (runs on transcript text) ──────────────────────────

const HEAVY_FILLERS = ["um", "uh", "er", "ah", "like", "you know", "i mean", "kind of", "sort of"];
const LIGHT_FILLERS = ["basically", "literally", "actually", "so", "right", "well", "honestly", "obviously"];

/**
 * Counts filler words in a transcript string.
 * Returns { count, words: [{word, count, weight}], score: 0–10 }
 */
export function analyzeFillerWords(transcript) {
  const lower = transcript.toLowerCase();
  const results = [];
  let weightedTotal = 0;
  let rawTotal = 0;

  const scan = (list, weight) => {
    for (const fw of list) {
      const re = new RegExp(`\\b${fw}\\b`, "g");
      const hits = (lower.match(re) || []).length;
      if (hits > 0) {
        results.push({ word: fw, count: hits, weight });
        rawTotal += hits;
        weightedTotal += hits * weight;
      }
    }
  };

  scan(HEAVY_FILLERS, 1);
  scan(LIGHT_FILLERS, 0.4);

  results.sort((a, b) => b.count * b.weight - a.count * a.weight);

  const wordCount = lower.split(/\s+/).filter(Boolean).length || 1;
  const ratio = weightedTotal / wordCount;
  const score = Math.max(0, Math.min(10, Math.round(10 - ratio * 80)));

  return { count: rawTotal, words: results, score };
}

/**
 * Check how well an answer follows STAR structure.
 * Returns { situation, task, action, result, score: 0–10 }
 */
export function analyzeSTAR(transcript) {
  const lower = transcript.toLowerCase();

  const cues = {
    situation: ["when i", "at my", "during", "in my previous", "in my last", "we had", "there was", "the situation"],
    task: ["i was responsible", "my role was", "i needed to", "i had to", "the task", "my job was", "i was asked"],
    action: ["i decided", "i took", "i implemented", "i collaborated", "i built", "i led", "what i did", "my approach", "i reached out", "i created"],
    result: ["as a result", "this led to", "the outcome", "we achieved", "it resulted", "the impact", "we increased", "we reduced", "ultimately"],
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