// ─────────────────────────────────────────────────────────
// Face · camera + MediaPipe pipeline
//
// Translates MediaPipe blendshapes into Ekman's basic emotions
// through linear combinations of action units.
// ─────────────────────────────────────────────────────────

import { updateLandmarks, setConnectionGraphs } from './scene.js';

let faceLandmarker = null;
let video = null;
let running = false;

const state = {
  samples: [],
  blinkCount: 0,
  blinkState: false,
  fragmentStartAt: null,
  lastSampleAt: 0,
  lastEventAt: 0,
  lastEventKey: null,
};

// Satirical reaction palette.
// Six Ekman basics plus five menippean-specific reactions.
// Each is a linear combination of action units with a threshold.
const EMOTION_RULES = [
  // ─── Ekman basics ───
  {
    name: 'alegría',
    combine: (m) => (m.smile || 0),
    threshold: 0.35,
  },
  {
    name: 'sorpresa',
    combine: (m) => Math.min(1, ((m.jawOpen || 0) * 1.2 + (m.browUp || 0) * 0.8)),
    threshold: 0.45,
  },
  {
    name: 'tristeza',
    combine: (m) => Math.min(1, ((m.browInnerUp || 0) * 0.6 + (m.frown || 0) * 0.8)),
    threshold: 0.30,
  },
  {
    name: 'enojo',
    combine: (m) => Math.min(1, ((m.browDown || 0) * 0.5 + (m.squint || 0) * 0.3 + (m.frown || 0) * 0.4)),
    threshold: 0.30,
  },
  {
    name: 'asco',
    combine: (m) => Math.min(1, ((m.sneer || 0) * 0.9 + (m.browDown || 0) * 0.3)),
    threshold: 0.25,
  },
  {
    name: 'ironía',
    combine: (m) => Math.min(1, ((m.squint || 0) * 0.6 + (m.dimple || 0) * 0.5)),
    threshold: 0.30,
  },

  // ─── Menippean-specific reactions ───
  {
    name: 'sonrisa asimétrica',   // cynical half-smile — hallmark of recognizing the game
    combine: (m) => Math.min(1, (m.smileAsym || 0) * 2.0 + (m.smile || 0) * 0.3),
    threshold: 0.25,
  },
  {
    name: 'risa contenida',       // trying NOT to laugh at the uncomfortable
    combine: (m) => {
      const containment = (m.press || 0) * 0.5 + (m.dimple || 0) * 0.4;
      const faintSmile = Math.min(1, (m.smile || 0) * 2);
      return Math.min(1, containment * faintSmile);
    },
    threshold: 0.15,
  },
  {
    name: 'desdén',               // asymmetric dimple — Ekman's canonical contempt
    combine: (m) => Math.min(1, (m.dimpleAsym || 0) * 2.0 + (m.sneer || 0) * 0.3),
    threshold: 0.20,
  },
  {
    name: 'perplejidad',          // "wait, what?" — brow furrow with reserved mouth
    combine: (m) => {
      const q = (m.browInnerUp || 0) * 0.5 + (m.mouthClose || 0) * 0.3 + (m.mouthSideways || 0) * 0.4;
      return Math.min(1, q);
    },
    threshold: 0.25,
  },
  {
    name: 'atención aguda',       // eyes wide, no squint — alert reception
    combine: (m) => {
      const alert = (m.eyeWide || 0) * 0.8 - (m.squint || 0) * 0.4;
      return Math.max(0, Math.min(1, alert));
    },
    threshold: 0.30,
  },
];

export async function initMediaPipe() {
  try {
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/vision_bundle.mjs');
    const { FilesetResolver, FaceLandmarker } = vision;

    const resolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm'
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(resolver, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces: 1,
    });

    setConnectionGraphs({
      tess:  FaceLandmarker.FACE_LANDMARKS_TESSELATION.map(c => [c.start, c.end]),
      oval:  FaceLandmarker.FACE_LANDMARKS_FACE_OVAL.map(c => [c.start, c.end]),
      lips:  FaceLandmarker.FACE_LANDMARKS_LIPS.map(c => [c.start, c.end]),
      leye:  FaceLandmarker.FACE_LANDMARKS_LEFT_EYE.map(c => [c.start, c.end]),
      reye:  FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE.map(c => [c.start, c.end]),
      lbrow: FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW.map(c => [c.start, c.end]),
      rbrow: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW.map(c => [c.start, c.end]),
    });

    return true;
  } catch (e) {
    console.warn('[face] MediaPipe failed:', e);
    return false;
  }
}

export async function initCamera(videoEl) {
  video = videoEl;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false,
    });
    video.srcObject = stream;
    await new Promise(r => { video.onloadedmetadata = r; });
    await video.play();
    return true;
  } catch (e) {
    console.warn('[face] camera denied:', e);
    return false;
  }
}

function analyze(bs) {
  if (!bs || !bs.categories) return { metrics: {}, blink: 0 };
  const m = {};
  for (const c of bs.categories) m[c.categoryName] = c.score;

  // Averaged bilateral metrics (symmetric)
  const smileL = m.mouthSmileLeft || 0;
  const smileR = m.mouthSmileRight || 0;
  const dimpleL = m.mouthDimpleLeft || 0;
  const dimpleR = m.mouthDimpleRight || 0;
  const stretchL = m.mouthStretchLeft || 0;
  const stretchR = m.mouthStretchRight || 0;

  const metrics = {
    // Base action units
    smile:       (smileL + smileR) / 2,
    frown:       ((m.mouthFrownLeft || 0) + (m.mouthFrownRight || 0)) / 2,
    browUp:      ((m.browInnerUp || 0) + (m.browOuterUpLeft || 0) + (m.browOuterUpRight || 0)) / 3,
    browInnerUp: m.browInnerUp || 0,
    browDown:    ((m.browDownLeft || 0) + (m.browDownRight || 0)) / 2,
    squint:      ((m.eyeSquintLeft || 0) + (m.eyeSquintRight || 0)) / 2,
    jawOpen:     m.jawOpen || 0,
    sneer:       ((m.noseSneerLeft || 0) + (m.noseSneerRight || 0)) / 2,
    dimple:      (dimpleL + dimpleR) / 2,
    pucker:      m.mouthPucker || 0,
    stretch:     (stretchL + stretchR) / 2,
    press:       ((m.mouthPressLeft || 0) + (m.mouthPressRight || 0)) / 2,
    eyeWide:     ((m.eyeWideLeft || 0) + (m.eyeWideRight || 0)) / 2,
    jawForward:  m.jawForward || 0,
    mouthClose:  m.mouthClose || 0,
    cheekPuff:   m.cheekPuff || 0,
    cheekSquint: ((m.cheekSquintLeft || 0) + (m.cheekSquintRight || 0)) / 2,

    // Asymmetry signals — the heart of ironic / cynical reactions
    smileAsym:   Math.abs(smileL - smileR),
    dimpleAsym:  Math.abs(dimpleL - dimpleR),
    mouthSideways: Math.abs((m.mouthLeft || 0) - (m.mouthRight || 0)),

    // Gaze direction (averaged bilateral)
    gazeIn:     ((m.eyeLookInLeft || 0) + (m.eyeLookInRight || 0)) / 2,
    gazeOut:    ((m.eyeLookOutLeft || 0) + (m.eyeLookOutRight || 0)) / 2,
    gazeUp:     ((m.eyeLookUpLeft || 0) + (m.eyeLookUpRight || 0)) / 2,
    gazeDown:   ((m.eyeLookDownLeft || 0) + (m.eyeLookDownRight || 0)) / 2,
  };
  const blink = ((m.eyeBlinkLeft || 0) + (m.eyeBlinkRight || 0)) / 2;
  return { metrics, blink };
}

export function startLive(onEvent) {
  if (running) return;
  running = true;
  let lastT = -1;
  function tick() {
    if (!running) return;
    if (video && video.readyState >= 2 && faceLandmarker) {
      const now = performance.now();
      if (now !== lastT) {
        lastT = now;
        try {
          const result = faceLandmarker.detectForVideo(video, now);
          if (result.faceLandmarks && result.faceLandmarks.length) {
            const landmarks = result.faceLandmarks[0];
            const bs = result.faceBlendshapes && result.faceBlendshapes[0];
            const tx = result.facialTransformationMatrixes && result.facialTransformationMatrixes[0];
            const { metrics, blink } = analyze(bs);
            // Extract head pose (yaw / pitch / roll) from the 4x4 matrix
            const pose = extractHeadPose(tx);
            metrics.headYaw = pose.yaw;
            metrics.headPitch = pose.pitch;
            metrics.headRoll = pose.roll;
            updateLandmarks(landmarks, metrics, tx);
            sample(metrics, blink, onEvent);
          }
        } catch (e) { console.error(e); }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Extract Euler angles from the 4x4 column-major matrix MediaPipe provides.
// Returns radians: yaw (left/right turn), pitch (up/down nod), roll (tilt).
function extractHeadPose(tx) {
  if (!tx || !tx.data) return { yaw: 0, pitch: 0, roll: 0 };
  const m = tx.data;
  // Column-major: m[0..3] col 0, m[4..7] col 1, m[8..11] col 2
  const r11 = m[0], r12 = m[4], r13 = m[8];
  const r21 = m[1], r22 = m[5], r23 = m[9];
  const r31 = m[2], r32 = m[6], r33 = m[10];
  const pitch = Math.asin(-Math.max(-1, Math.min(1, r23)));
  const yaw   = Math.atan2(r13, r33);
  const roll  = Math.atan2(r21, r22);
  return { yaw, pitch, roll };
}

export function markFragmentStart() {
  state.fragmentStartAt = performance.now();
  state.samples = [];
  state.blinkCount = 0;
  state.blinkState = false;
  state.lastEventKey = null;
}

function sample(metrics, blink, onEvent) {
  const now = performance.now();
  if (!state.fragmentStartAt) return;
  if (now - state.lastSampleAt < 180) return;
  state.lastSampleAt = now;

  state.samples.push({
    t: Math.floor(now - state.fragmentStartAt),
    ...metrics,
  });
  const blinking = blink > 0.4;
  if (blinking && !state.blinkState) state.blinkCount++;
  state.blinkState = blinking;

  // Emotion detection — pick the strongest emotion above its threshold
  if (now - state.lastEventAt < 1600) return;
  let detected = null;
  let maxScore = 0;
  for (const rule of EMOTION_RULES) {
    const score = rule.combine(metrics);
    if (score > rule.threshold && score > maxScore) {
      detected = { name: rule.name, delta: score };
      maxScore = score;
    }
  }
  if (detected && detected.name !== state.lastEventKey) {
    state.lastEventAt = now;
    state.lastEventKey = detected.name;
    if (onEvent) onEvent(detected);
  }
}

export function closeFragment() {
  if (!state.fragmentStartAt) return null;
  const dwellMs = Math.round(performance.now() - state.fragmentStartAt);
  if (dwellMs < 400) return null;

  // ─── Peaks + means of all tracked blendshape metrics ───
  const keys = [
    'smile','frown','browUp','browDown','squint','jawOpen','sneer','dimple','pucker',
    'stretch','press','eyeWide','jawForward','mouthClose','cheekPuff','cheekSquint',
    'smileAsym','dimpleAsym','mouthSideways',
    'gazeIn','gazeOut','gazeUp','gazeDown',
  ];
  const peaks = {}, means = {};
  for (const k of keys) {
    let max = 0, sum = 0;
    for (const s of state.samples) {
      if ((s[k] || 0) > max) max = s[k] || 0;
      sum += s[k] || 0;
    }
    peaks[k] = +max.toFixed(3);
    means[k] = state.samples.length ? +(sum / state.samples.length).toFixed(3) : 0;
  }

  // ─── Head pose range + stability (std dev) ───
  let yawMin = Infinity, yawMax = -Infinity;
  let pitchMin = Infinity, pitchMax = -Infinity;
  let rollMin = Infinity, rollMax = -Infinity;
  let yawSum = 0, pitchSum = 0, nPose = 0;
  for (const s of state.samples) {
    if (s.headYaw != null) {
      yawMin = Math.min(yawMin, s.headYaw); yawMax = Math.max(yawMax, s.headYaw);
      pitchMin = Math.min(pitchMin, s.headPitch); pitchMax = Math.max(pitchMax, s.headPitch);
      rollMin = Math.min(rollMin, s.headRoll); rollMax = Math.max(rollMax, s.headRoll);
      yawSum += s.headYaw; pitchSum += s.headPitch; nPose++;
    }
  }
  let yawStd = 0, pitchStd = 0;
  if (nPose > 1) {
    const yawMean = yawSum / nPose;
    const pitchMean = pitchSum / nPose;
    let yv = 0, pv = 0;
    for (const s of state.samples) {
      if (s.headYaw != null) {
        yv += (s.headYaw - yawMean) ** 2;
        pv += (s.headPitch - pitchMean) ** 2;
      }
    }
    yawStd = Math.sqrt(yv / nPose);
    pitchStd = Math.sqrt(pv / nPose);
  }
  const headPose = (yawMin !== Infinity) ? {
    yaw_range: +(yawMax - yawMin).toFixed(3),
    pitch_range: +(pitchMax - pitchMin).toFixed(3),
    roll_range: +(rollMax - rollMin).toFixed(3),
    yaw_std: +yawStd.toFixed(3),
    pitch_std: +pitchStd.toFixed(3),
    stability_score: +(1 / (1 + yawStd + pitchStd)).toFixed(3),
  } : null;

  // ─── Blink rate per minute ───
  const blinkRate = dwellMs > 0 ? +(state.blinkCount * 60000 / dwellMs).toFixed(1) : 0;

  // ─── Dominant emotion + full emotion peak profile ───
  const emotionPeaks = {};
  let dominantEmotion = null;
  let dominantScore = 0;
  for (const rule of EMOTION_RULES) {
    let maxScore = 0;
    for (const s of state.samples) {
      const score = rule.combine(s);
      if (score > maxScore) maxScore = score;
    }
    emotionPeaks[rule.name] = +maxScore.toFixed(3);
    if (maxScore > rule.threshold && maxScore > dominantScore) {
      dominantEmotion = rule.name;
      dominantScore = maxScore;
    }
  }

  // ─── Temporal dynamics ───

  // Latency: ms until the first emotion crosses its threshold
  let firstReactionMs = null;
  for (const s of state.samples) {
    for (const rule of EMOTION_RULES) {
      if (rule.combine(s) > rule.threshold) {
        firstReactionMs = s.t;
        break;
      }
    }
    if (firstReactionMs != null) break;
  }

  // Count of emotion-peak crossings — how many times an emotion crossed its threshold
  // (counting transitions below→above only, with a minimum gap of ~500ms)
  let emotionPeakCount = 0;
  let longestPeakMs = 0;
  const activeStart = {};  // {ruleName: timestamp}
  for (const s of state.samples) {
    for (const rule of EMOTION_RULES) {
      const active = rule.combine(s) > rule.threshold;
      if (active && activeStart[rule.name] == null) {
        activeStart[rule.name] = s.t;
        emotionPeakCount++;
      } else if (!active && activeStart[rule.name] != null) {
        const peakDuration = s.t - activeStart[rule.name];
        if (peakDuration > longestPeakMs) longestPeakMs = peakDuration;
        activeStart[rule.name] = null;
      }
    }
  }
  // Close any still-open peaks
  for (const name in activeStart) {
    if (activeStart[name] != null && state.samples.length > 0) {
      const d = state.samples[state.samples.length - 1].t - activeStart[name];
      if (d > longestPeakMs) longestPeakMs = d;
    }
  }

  // Emotional oscillation: standard deviation of key metrics summed
  let smileOsc = 0, browOsc = 0, squintOsc = 0;
  if (state.samples.length > 1) {
    const smileMean = means.smile;
    const browMean = means.browUp;
    const squintMean = means.squint;
    let sv = 0, bv = 0, qv = 0;
    for (const s of state.samples) {
      sv += ((s.smile || 0) - smileMean) ** 2;
      bv += ((s.browUp || 0) - browMean) ** 2;
      qv += ((s.squint || 0) - squintMean) ** 2;
    }
    smileOsc = Math.sqrt(sv / state.samples.length);
    browOsc = Math.sqrt(bv / state.samples.length);
    squintOsc = Math.sqrt(qv / state.samples.length);
  }
  const oscillation = +(smileOsc + browOsc + squintOsc).toFixed(3);

  // Expressive entropy — richness of the facial repertoire activated.
  // Normalize peaks of 10 principal expressions, treat as a probability
  // distribution, compute Shannon entropy.
  const entropyKeys = ['smile','frown','browUp','browDown','squint','jawOpen','sneer','dimple','press','eyeWide'];
  let totalP = 0;
  for (const k of entropyKeys) totalP += peaks[k];
  let entropy = 0;
  if (totalP > 0) {
    for (const k of entropyKeys) {
      const p = peaks[k] / totalP;
      if (p > 0) entropy -= p * Math.log2(p);
    }
  }
  entropy = +entropy.toFixed(3);

  return {
    dwell_ms: dwellMs,
    peaks, means,
    blink_count: state.blinkCount,
    blink_rate_per_min: blinkRate,
    samples_count: state.samples.length,
    head_pose: headPose,
    dominant_emotion: dominantEmotion,
    dominant_emotion_score: +dominantScore.toFixed(3),
    emotion_peaks: emotionPeaks,
    first_reaction_ms: firstReactionMs,
    emotion_peak_count: emotionPeakCount,
    longest_peak_ms: longestPeakMs,
    oscillation: oscillation,
    expressive_entropy: entropy,
  };
}
