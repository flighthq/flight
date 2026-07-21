// particle-emitter-color — validates the ParticleEmitter renderer's PER-PARTICLE color tint: each
// particle carries its own RGB in the emitter's `colors` array, which the shader multiplies against the
// (white) atlas texel so one emitter draws differently-colored particles in a single batched pass. This
// is the color-over-lifetime channel a fire/spark emitter relies on.
//
// This runs on WEBGL + WEBGPU only, on purpose: the Canvas 2D particle renderer has no per-pixel multiply
// and intentionally ignores the `colors` array (see displayobject-canvas/canvasParticleEmitter.ts), so a
// canvas capture would draw every particle white and disagree with the GPU backends. The cross-backend
// behavior canvas CAN honor (position, atlas-region selection, scale, rotation) is covered by the sibling
// particle-emitter test; this one isolates the tint so it is tested honestly where it exists.
//
// Particle data is set explicitly — no simulation — for a deterministic frame. The texture is a single
// solid-white region, so each particle's rendered center reads back its own tint. The oracle proves the
// six particles show six distinct tint colors and the gaps between them stay background.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createDisplayContainer,
  createImageResource,
  createParticleEmitter,
  createTextureAtlas,
  getSurfacePixelRgb,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  ParticleEmitter2DKind,
  reserveParticleEmitter,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 450;

// The atlas is one solid-white REGION×REGION swatch; color comes entirely from each particle's tint.
const REGION = 24;

// [centerX, centerY, scale, rotation, r, g, b] in logical space; tint channels are 0..1 floats.
const PARTICLES: readonly (readonly [number, number, number, number, number, number, number])[] = [
  [160, 130, 2.0, 0, 1, 0, 0], // red
  [400, 130, 2.0, 0.6, 0, 1, 0], // green (rotated)
  [640, 130, 2.0, 0, 0, 0, 1], // blue
  [160, 320, 1.4, 0.6, 1, 1, 0], // yellow (rotated)
  [400, 320, 3.0, 0, 1, 0, 1], // magenta (largest)
  [640, 320, 1.4, 0, 0, 1, 1], // cyan
];

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x101018ff, // opaque dark (packed RGBA, low byte = alpha)
  kinds: [ParticleEmitter2DKind],
});

function makeWhiteCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = REGION;
  c.height = REGION;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgb(255,255,255)';
  ctx.fillRect(0, 0, REGION, REGION);
  return c;
}

const atlas = createTextureAtlas({ image: createImageResource(makeWhiteCanvas()) });
addTextureAtlasRegion(atlas, 0, 0, REGION, REGION);

const root = createDisplayContainer();

const emitter = createParticleEmitter();
emitter.data.atlas = atlas;
addNodeChild(root, emitter);
invalidateNodeLocalTransform(emitter);

reserveParticleEmitter(emitter, PARTICLES.length);
emitter.data.particleCount = PARTICLES.length;
for (let i = 0; i < PARTICLES.length; i++) {
  const [cx, cy, scale, rotation, r, g, b] = PARTICLES[i];
  emitter.data.ids[i] = 0; // the single white region
  emitter.data.alphas[i] = 1;
  emitter.data.colors[i * 3] = r;
  emitter.data.colors[i * 3 + 1] = g;
  emitter.data.colors[i * 3 + 2] = b;
  // transforms position is the quad's top-left anchor; offset by half the scaled footprint to center it.
  const half = (REGION * scale) / 2;
  emitter.data.transforms[i * 4] = cx - half;
  emitter.data.transforms[i * 4 + 1] = cy - half;
  emitter.data.transforms[i * 4 + 2] = rotation;
  emitter.data.transforms[i * 4 + 3] = scale;
}
invalidateNodeAppearance(emitter);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  for (let i = 0; i < PARTICLES.length; i++) {
    const [cx, cy, , , r, g, b] = PARTICLES[i];
    const c = at(cx, cy);
    if (!isTint(c, r, g, b)) {
      throw new Error(`[particle-emitter-color] particle ${i} center not tint (${r},${g},${b}) — got #${hex(c)}`);
    }
  }

  for (const [gx, gy] of [
    [280, 225],
    [520, 225],
  ] as const) {
    const g = at(gx, gy);
    if (!isBackground(g)) {
      throw new Error(`[particle-emitter-color] gap at (${gx},${gy}) not background — got #${hex(g)}`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// A tint channel of 1 should read high (near 255), 0 should read low (near the dark background); solid
// white-texel centers clear these wide thresholds even with edge antialiasing.
function isTint(rgb: number, r: number, g: number, b: number): boolean {
  const want = (v: number, actual: number): boolean => (v > 0.5 ? actual > 150 : actual < 105);
  return want(r, channel(rgb, 16)) && want(g, channel(rgb, 8)) && want(b, channel(rgb, 0));
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
