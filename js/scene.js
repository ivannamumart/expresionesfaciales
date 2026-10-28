// ─────────────────────────────────────────────────────────
// Scene · 3D observatory
//
// Three layers compose the mannequin:
//   1. SURFACE  — solid triangular mesh of the face, rendered with a
//                 Fresnel shader. Center is deep magenta/dark-blue;
//                 silhouette edges glow azure. This gives the volume.
//   2. WIREFRAME — teal scanlines + mesh edges on top of the surface,
//                  faint but visible, like topographic contours.
//   3. POINTS    — small dots at the 468 landmarks. Base is teal/soft.
//                  When a microexpression activates in a zone, those
//                  dots grow and shift to pastel (joy/wonder/irony).
//
// Head rotation follows the viewer's facial transformation matrix.
// Pre-camera: static neutral canonical face, frontal.
// ─────────────────────────────────────────────────────────

import * as THREE from 'three';
import { CANONICAL_FACE } from './canonical-face.js';
import { CANONICAL_FACES } from './canonical-faces.js';

// ─────────── Palette (synced with CSS tokens) ───────────
const TEAL = new THREE.Color(0x37B9A3);
const AZURE = new THREE.Color(0x7DD6E8);
const DARK_BLUE = new THREE.Color(0x1E3A5F);
const DEEP_MAGENTA = new THREE.Color(0x451C38);
const JOY = new THREE.Color(0xFF93AF);
const WONDER = new THREE.Color(0xC9A3F5);
const IRONY = new THREE.Color(0x7FE6C4);
const DISDAIN = new THREE.Color(0xF5BA8A);

export const scene = {
  threeScene: null,
  camera: null,
  renderer: null,
  pivot: null,
  surfaceMesh: null,
  wireframeMesh: null,
  pointsMesh: null,
  particlesMesh: null,
  rotationMatrix: new THREE.Matrix4(),
  targetMatrix: new THREE.Matrix4(),
  activeMetrics: {},
  usingLive: false,
  neutralLandmarks: null,
  width: 0,
  height: 0,
  startTime: 0,
};

// Face mesh connection graphs — set by face.js when MediaPipe loads
let LIPS = null, L_EYE = null, R_EYE = null, L_BROW = null, R_BROW = null, FACE_OVAL = null;

// Approximate zone sets for the 468 landmarks
const ZONE_MOUTH = new Set([
  61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,80,81,82,
  13,14,15,16,17,18,86,87,88,89,90,91,95,96,97,98,99,
  146,178,179,180,181,185,186,191,267,268,269,270,271,272,291,292,
  293,294,295,296,308,310,311,312,314,315,316,317,318,319,320,321,
  324,325,375,402,403,404,405,409,415
]);
const ZONE_BROW = new Set([
  46,47,52,53,55,65,66,70,105,107,222,223,224,225,276,277,282,283,
  285,295,296,300,334,336
]);
const ZONE_EYE = new Set([
  33,133,160,159,158,157,173,153,144,145,163,7,246,161,
  362,263,386,385,384,398,382,381,380,373,374,390,249,466,388
]);

function zoneForIndex(i) {
  if (ZONE_MOUTH.has(i)) return 'mouth';
  if (ZONE_BROW.has(i)) return 'brow';
  if (ZONE_EYE.has(i)) return 'eye';
  return 'face';
}

// ─────────── Init ───────────

export function initScene(canvas) {
  scene.renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  scene.renderer.setClearColor(0x000000, 0);
  updateSize();

  scene.threeScene = new THREE.Scene();
  scene.camera = new THREE.PerspectiveCamera(32, scene.width / scene.height, 0.1, 100);
  scene.camera.position.set(0, 0, 3.3);
  scene.camera.lookAt(0, 0, 0);

  scene.pivot = new THREE.Group();
  scene.threeScene.add(scene.pivot);

  // Normalized canonical face: 468 vertices [-1,1], Y-up
  scene.neutralLandmarks = CANONICAL_FACE.map(([x, y, z]) => ({ x, y, z }));

  buildSurface();
  buildWireframe();
  buildPoints();
  buildParticles();

  // First render with neutral pose
  updateGeometry(scene.neutralLandmarks);
  updatePointColors({});

  scene.startTime = performance.now();
  animate();

  window.addEventListener('resize', updateSize);
}

function updateSize() {
  const rect = scene.renderer.domElement.getBoundingClientRect();
  scene.width = rect.width;
  scene.height = rect.height;
  scene.renderer.setSize(scene.width, scene.height, false);
  if (scene.camera) {
    scene.camera.aspect = scene.width / scene.height;
    scene.camera.updateProjectionMatrix();
  }
}

// ─────────── 1 · SOLID SURFACE ───────────
// Triangular mesh of the face with a Fresnel-ish shader.
// Interior is dark (blends with background), silhouette edges glow azure.

function buildSurface() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(468 * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(CANONICAL_FACES);
  geo.computeVertexNormals();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTeal: { value: new THREE.Vector3(TEAL.r, TEAL.g, TEAL.b) },
      uAzure: { value: new THREE.Vector3(AZURE.r, AZURE.g, AZURE.b) },
      uDeep: { value: new THREE.Vector3(DEEP_MAGENTA.r, DEEP_MAGENTA.g, DEEP_MAGENTA.b) },
      uDarkBlue: { value: new THREE.Vector3(DARK_BLUE.r, DARK_BLUE.g, DARK_BLUE.b) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vPos;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        vPos = position;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uTeal;
      uniform vec3 uAzure;
      uniform vec3 uDeep;
      uniform vec3 uDarkBlue;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vPos;
      void main() {
        float fres = 1.0 - max(dot(vNormal, vViewDir), 0.0);
        float rim = pow(fres, 2.0);
        // Interior starts dark (dark blue), teal fills most, azure glows at the rim
        vec3 col = mix(uDarkBlue, uTeal, smoothstep(0.0, 0.5, fres));
        col = mix(col, uAzure, pow(fres, 3.0) * 1.4);
        // Depth hint: slight azure boost toward viewer
        float depth = clamp((vPos.z + 0.5) * 0.6, 0.0, 1.0);
        col = mix(col, uAzure * 0.6, depth * 0.2);
        // Thicker alpha so the sculpture is seen as a real surface
        float alpha = 0.78 + rim * 0.22;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  scene.surfaceMesh = new THREE.Mesh(geo, mat);
  scene.pivot.add(scene.surfaceMesh);
}

// ─────────── 2 · WIREFRAME (teal scanlines) ───────────
// Edges of the triangular mesh, drawn as thin teal lines.

function buildWireframe() {
  // Wireframe lines removed intentionally — they were muddling the composition.
  // The Fresnel surface alone gives the sculpture its form; crisp points sit on top.
  scene.wireframeMesh = null;
}

// ─────────── 3 · POINTS (small crisp dots) ───────────

function buildPoints() {
  const positions = new Float32Array(468 * 3);
  const colors = new Float32Array(468 * 3);
  const sizes = new Float32Array(468);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uDpr: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: `
      attribute float size;
      uniform float uDpr;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Fixed pixel size — does NOT inflate with distance.
        // size is in CSS px; multiply by dpr for retina crispness.
        gl_PointSize = size * uDpr;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        // Hard-crisp circle, antialiased on 1px edge only
        float alpha = 1.0 - smoothstep(0.42, 0.5, d);
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: false,       // always on top of the surface
    blending: THREE.NormalBlending,
  });

  scene.pointsMesh = new THREE.Points(geo, mat);
  scene.pointsMesh.renderOrder = 10;
  scene.pivot.add(scene.pointsMesh);
}

// ─────────── 4 · PARTICLES BACKGROUND (depth atmosphere) ───────────

function buildParticles() {
  const COUNT = 300;
  const positions = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const seeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
    positions[i * 3 + 2] = -2 - Math.random() * 8;
    sizes[i] = 0.5 + Math.random() * 1.5;
    seeds[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Vector3(TEAL.r, TEAL.g, TEAL.b) },
    },
    vertexShader: `
      attribute float size;
      attribute float seed;
      uniform float uTime;
      varying float vSeed;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.3 + seed * 10.0) * 0.08;
        p.x += cos(uTime * 0.2 + seed * 7.0) * 0.08;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * (80.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
        vSeed = seed;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vSeed;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.0, d) * (0.08 + vSeed * 0.1);
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  scene.particlesMesh = new THREE.Points(geo, mat);
  scene.threeScene.add(scene.particlesMesh);
}

// ─────────── Updates per frame ───────────

function updateGeometry(landmarks) {
  if (!landmarks) return;

  let cx = 0, cy = 0, cz = 0;
  for (const p of landmarks) { cx += p.x; cy += p.y; cz += p.z; }
  cx /= landmarks.length; cy /= landmarks.length; cz /= landmarks.length;

  const isLive = scene.usingLive;
  const SCALE = isLive ? 2.6 : 1.2;
  const Z_SCALE = isLive ? 2.6 : 1.0;
  const Y_FLIP = isLive ? -1 : 1;
  const X_FLIP = isLive ? -1 : 1;

  const surfacePos = scene.surfaceMesh.geometry.getAttribute('position');
  const pointPos = scene.pointsMesh.geometry.getAttribute('position');

  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    const x = X_FLIP * (p.x - cx) * SCALE;
    const y = Y_FLIP * (p.y - cy) * SCALE;
    const z = -(p.z - cz) * Z_SCALE;
    surfacePos.array[i * 3 + 0] = x;
    surfacePos.array[i * 3 + 1] = y;
    surfacePos.array[i * 3 + 2] = z;
    pointPos.array[i * 3 + 0] = x;
    pointPos.array[i * 3 + 1] = y;
    pointPos.array[i * 3 + 2] = z;
  }
  surfacePos.needsUpdate = true;
  pointPos.needsUpdate = true;
  scene.surfaceMesh.geometry.computeVertexNormals();
}

function updatePointColors(metrics) {
  const colorAttr = scene.pointsMesh.geometry.getAttribute('color');
  const sizeAttr = scene.pointsMesh.geometry.getAttribute('size');
  const m = metrics || {};

  // Small base, grow only when an expression activates the zone.
  // Sizes are in CSS pixels (fixed, not depth-scaled).
  const BASE = 1.8;
  const MAX  = 5.0;

  for (let i = 0; i < 468; i++) {
    const zone = zoneForIndex(i);
    let color = TEAL;
    let size = BASE;

    if (zone === 'mouth') {
      const smile = m.smile || 0;
      const frown = m.frown || 0;
      const intensity = Math.max(smile, frown);
      if (intensity > 0.12) {
        const t = Math.min(1, intensity * 2.5);
        color = frown > smile ? TEAL.clone().lerp(DISDAIN, t) : TEAL.clone().lerp(JOY, t);
        size = BASE + intensity * (MAX - BASE);
      }
    } else if (zone === 'brow') {
      const browUp = m.browUp || 0;
      const browDown = m.browDown || 0;
      const intensity = Math.max(browUp, browDown);
      if (intensity > 0.12) {
        const t = Math.min(1, intensity * 2.5);
        color = browDown > browUp ? TEAL.clone().lerp(DISDAIN, t) : TEAL.clone().lerp(WONDER, t);
        size = BASE + intensity * (MAX - BASE);
      }
    } else if (zone === 'eye') {
      const squint = m.squint || 0;
      if (squint > 0.12) {
        const t = Math.min(1, squint * 2.5);
        color = TEAL.clone().lerp(IRONY, t);
        size = BASE + squint * (MAX - BASE);
      }
    }

    colorAttr.array[i * 3 + 0] = color.r;
    colorAttr.array[i * 3 + 1] = color.g;
    colorAttr.array[i * 3 + 2] = color.b;
    sizeAttr.array[i] = size;
  }
  colorAttr.needsUpdate = true;
  sizeAttr.needsUpdate = true;
}

// ─────────── Public API ───────────

export function updateLandmarks(landmarks, metrics, transformationMatrix) {
  scene.usingLive = true;
  scene.activeMetrics = metrics || {};
  updateGeometry(landmarks);
  updatePointColors(scene.activeMetrics);

  if (transformationMatrix && transformationMatrix.data) {
    scene.targetMatrix.fromArray(transformationMatrix.data);
  }
}

export function setConnectionGraphs(graphs) {
  // Kept for compatibility; mesh+edges are now driven by canonical topology
  LIPS = graphs.lips;
  L_EYE = graphs.leye;
  R_EYE = graphs.reye;
  L_BROW = graphs.lbrow;
  R_BROW = graphs.rbrow;
  FACE_OVAL = graphs.oval;
}

// ─────────── Animation loop ───────────

function animate() {
  requestAnimationFrame(animate);
  if (!scene.pivot) return;

  const t = (performance.now() - scene.startTime) / 1000;

  if (scene.particlesMesh) {
    scene.particlesMesh.material.uniforms.uTime.value = t;
  }

  if (scene.usingLive) {
    smoothMatrix(scene.rotationMatrix, scene.targetMatrix, 0.2);
    const rot = extractRotation(scene.rotationMatrix);
    scene.pivot.quaternion.setFromRotationMatrix(rot);
  } else {
    // Pre-camera: static frontal with a very gentle sway so it feels alive
    scene.pivot.rotation.y = Math.sin(t * 0.25) * 0.08;
    scene.pivot.rotation.x = Math.sin(t * 0.18) * 0.04;
  }

  scene.renderer.render(scene.threeScene, scene.camera);
}

function smoothMatrix(current, target, t) {
  const a = current.elements;
  const b = target.elements;
  for (let i = 0; i < 16; i++) a[i] += (b[i] - a[i]) * t;
}

function extractRotation(m) {
  const rot = new THREE.Matrix4();
  const e = m.elements;
  rot.set(
    e[0], e[4], e[8], 0,
    e[1], e[5], e[9], 0,
    e[2], e[6], e[10], 0,
    0,    0,   0,     1
  );
  return rot;
}
