import type { Shape } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  createDisplayObject,
  createShape,
  createWebGLCanvasElement,
  createWebGLRenderState,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  invalidateNodeLocalTransform,
  prepareDisplayObjectRender,
  registerDefaultWebGLMaterial,
  registerRenderer,
  registerWebGLShapeCommands,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

// A calm field of soft translucent orbs drifting behind the landing content, rendered with Flight
// itself — the page dogfoods the SDK instead of faking motion with CSS. Pure transform animation
// (drift + gentle scale pulse) keeps it on the simplest verified render path: shapes, one renderer,
// `invalidateNodeLocalTransform` per frame under the `requiresInvalidation` sync policy.
//
// This is one of two interchangeable landing backgrounds (see background-particles.ts); main.ts
// selects between them. The background is captured for visual-regression baselines (capture:landing),
// so it must render the same frame every run: the orb field is seeded from a fixed value and the
// animation advances on a fixed timestep rather than the wall clock. Both keep the frame reproducible.

const BACKGROUND = 0x0e0e0e00;
const PALETTE = [0x3d7fff, 0x7ab8ff, 0x4f8cff, 0x9fd0ff, 0x6aa8ff];
const ORB_COUNT = 16;
const ORB_SEED = 0x5f1697;
const STEP_MS = 16;

interface Orb {
  node: Shape;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseScale: number;
  pulseRate: number;
  pulsePhase: number;
}

// A seeded pseudo-random generator (mulberry32) so the orb field is identical on every load. Using
// the platform Math.random would make each capture differ, breaking the visual baseline.
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function startOrbBackground(): void {
  const random = createSeededRandom(ORB_SEED);
  const randomBetween = (min: number, max: number): number => min + random() * (max - min);

  const pixelRatio = window.devicePixelRatio || 1;
  let width = window.innerWidth;
  let height = window.innerHeight;

  const canvas = createWebGLCanvasElement(width, height, pixelRatio);
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '0';
  canvas.style.pointerEvents = 'none';
  document.body.prepend(canvas);

  const state = createWebGLRenderState(canvas, {
    backgroundColor: BACKGROUND,
    sceneGraphSyncPolicy: 'requiresInvalidation',
  });
  registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
  registerWebGLShapeCommands(defaultWebGLShapeCommands);
  registerDefaultWebGLMaterial(state);

  const root = createDisplayObject();
  root.scaleX = pixelRatio;
  root.scaleY = pixelRatio;
  // Derive the root's scaled transform on the first prepare under the requiresInvalidation policy.
  invalidateNodeLocalTransform(root);

  const orbs: Orb[] = [];
  for (let i = 0; i < ORB_COUNT; i++) {
    const radius = randomBetween(40, 160);
    const color = PALETTE[i % PALETTE.length];
    // Larger orbs are a touch fainter, reading as out-of-focus depth behind the smaller, brighter
    // ones, but every orb stays clearly visible against the dark background.
    const alpha = randomBetween(0.4, 0.6) * (110 / radius);

    const node = createShape();
    appendShapeBeginFill(node, color, Math.max(0.16, Math.min(alpha, 0.6)));
    appendShapeCircle(node, 0, 0, radius);

    const orb: Orb = {
      node,
      x: randomBetween(0, width),
      y: randomBetween(0, height),
      vx: randomBetween(-40, 40),
      vy: randomBetween(-40, 40),
      radius,
      baseScale: randomBetween(0.8, 1.2),
      pulseRate: randomBetween(0.0004, 0.0011),
      pulsePhase: randomBetween(0, Math.PI * 2),
    };
    orbs.push(orb);
    addNodeChild(root, node);
  }

  // Drift past the edges by the largest radius before wrapping, so orbs never pop in mid-screen.
  const margin = 200;

  // Under visual-regression capture the harness sets window.__flightCapture before any page script
  // runs. In that mode the field holds its seeded opening frame: state never advances, so every
  // rendered frame is byte-identical and the screenshot hash is stable enough to commit as the
  // baseline. The scene is still redrawn each tick so the WebGL drawing buffer stays populated for
  // the screenshot. For real visitors the flag is unset and the field animates immediately.
  const captureMode = (window as unknown as { __flightCapture?: boolean }).__flightCapture === true;

  // Fixed timestep: advance by a constant each frame instead of reading the wall clock. The motion
  // stays smooth at the ~60fps the page renders at; a decorative background does not need wall-clock
  // accuracy, and the fixed step keeps the animation reproducible from any given frame.
  let elapsed = 0;
  function frame(): void {
    if (!captureMode) {
      elapsed += STEP_MS;

      for (const orb of orbs) {
        orb.x += orb.vx * (STEP_MS / 1000);
        orb.y += orb.vy * (STEP_MS / 1000);
        if (orb.x < -margin) orb.x = width + margin;
        if (orb.x > width + margin) orb.x = -margin;
        if (orb.y < -margin) orb.y = height + margin;
        if (orb.y > height + margin) orb.y = -margin;
      }
    }

    for (const orb of orbs) {
      const pulse = 1 + 0.12 * Math.sin(elapsed * orb.pulseRate + orb.pulsePhase);
      const scale = orb.baseScale * pulse;
      orb.node.x = orb.x;
      orb.node.y = orb.y;
      orb.node.scaleX = scale;
      orb.node.scaleY = scale;
      invalidateNodeLocalTransform(orb.node);
    }

    if (prepareDisplayObjectRender(state, root)) {
      renderWebGLBackground(state);
      renderWebGLDisplayObject(state, root);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  // The drawing buffer stays at its initial size; CSS stretches the canvas to cover the viewport.
  // Track the logical bounds so orbs keep wrapping across the whole window after a resize.
  window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
  });
}
