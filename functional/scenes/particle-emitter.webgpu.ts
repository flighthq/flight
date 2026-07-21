// particle-emitter — validates the batched ParticleEmitter renderer: one emitter node drawing MANY
// particles in a single pass, each with its own position, atlas region, scale, and rotation read from
// the emitter's particle arrays. This is the instanced/batched draw path (drawGlParticleEmitter builds
// an instance buffer and issues one instanced draw), distinct from a Sprite's single-quad draw.
//
// Particle data is set explicitly — no simulation — so the frame is deterministic and identical on every
// backend and every run (the simulation itself is covered by @flighthq/particles unit tests; a render
// functional test isolates the renderer). Color here is carried by the ATLAS REGION each particle selects,
// NOT by a per-particle color tint: the Canvas 2D particle renderer intentionally ignores per-particle
// color (it has no per-pixel multiply), so region selection is the only color channel that agrees across
// Canvas/Gl/Wgpu. This test therefore runs on all three backends and asserts only what canvas can honor.
// The per-particle color-tint path (a Gl/Wgpu feature) has its own test: particle-emitter-color.
//
// The oracle proves each particle drew its region's color at its own position and scale, that a rotated
// particle still lands on its center, and that the gaps between particles stay background.
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

// Each atlas region is a REGION×REGION solid color swatch; the atlas image is a horizontal strip of them.
const REGION = 24;

// One particle per swatch. [regionId, centerX, centerY, scale, rotation] in logical space. Rotation is
// non-zero on a couple to exercise the sin/cos instance transform; a rotated solid square still covers
// its own center, so the center-color check stays rotation-invariant.
const PARTICLES: readonly (readonly [number, number, number, number, number])[] = [
  [0, 160, 130, 2.0, 0], // red
  [1, 400, 130, 2.0, 0.6], // green (rotated)
  [2, 640, 130, 2.0, 0], // blue
  [3, 160, 320, 1.4, 0.6], // yellow (rotated)
  [4, 400, 320, 3.0, 0], // magenta (largest)
  [5, 640, 320, 1.4, 0], // cyan
];

// Swatch colors, in atlas-region order. Solid and saturated so a center sample reads back cleanly.
const SWATCHES: readonly (readonly [number, number, number])[] = [
  [255, 0, 0], // 0 red
  [0, 255, 0], // 1 green
  [0, 0, 255], // 2 blue
  [255, 255, 0], // 3 yellow
  [255, 0, 255], // 4 magenta
  [0, 255, 255], // 5 cyan
];

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x101018ff, // opaque dark (packed RGBA, low byte = alpha)
  kinds: [ParticleEmitter2DKind],
});

function makeAtlasCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = REGION * SWATCHES.length;
  c.height = REGION;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < SWATCHES.length; i++) {
    const [r, g, b] = SWATCHES[i];
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(i * REGION, 0, REGION, REGION);
  }
  return c;
}

const atlas = createTextureAtlas({ image: createImageResource(makeAtlasCanvas()) });
for (let i = 0; i < SWATCHES.length; i++) addTextureAtlasRegion(atlas, i * REGION, 0, REGION, REGION);

const root = createDisplayContainer();

// One emitter at the origin; particle transforms are authored directly in logical canvas coordinates.
const emitter = createParticleEmitter();
emitter.data.atlas = atlas;
addNodeChild(root, emitter);
invalidateNodeLocalTransform(emitter);

reserveParticleEmitter(emitter, PARTICLES.length);
emitter.data.particleCount = PARTICLES.length;
for (let i = 0; i < PARTICLES.length; i++) {
  const [id, cx, cy, scale, rotation] = PARTICLES[i];
  emitter.data.ids[i] = id;
  emitter.data.alphas[i] = 1;
  // White per-particle tint so the Gl/Wgpu color multiply leaves the region color unchanged (Canvas
  // ignores this array entirely). Without it a zero-filled tint would render the particles black.
  emitter.data.colors[i * 3] = 1;
  emitter.data.colors[i * 3 + 1] = 1;
  emitter.data.colors[i * 3 + 2] = 1;
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
    const [id, cx, cy] = PARTICLES[i];
    const c = at(cx, cy);
    if (!isColor(c, SWATCHES[id])) {
      throw new Error(
        `[particle-emitter] particle ${i} (region ${id}) center not #${hexRgb(SWATCHES[id])} — got #${hex(c)}`,
      );
    }
  }

  // Gaps between the particle columns/rows stay background — each particle paints only its own footprint.
  for (const [gx, gy] of [
    [280, 225],
    [520, 225],
  ] as const) {
    const g = at(gx, gy);
    if (!isBackground(g)) {
      throw new Error(`[particle-emitter] gap at (${gx},${gy}) not background — got #${hex(g)}`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// A channel is "high" when the swatch wants it near 255, "low" when near 0; solid center samples clear
// these wide thresholds even with edge antialiasing.
function isColor(rgb: number, swatch: readonly [number, number, number]): boolean {
  const want = (v: number, actual: number): boolean => (v > 128 ? actual > 150 : actual < 105);
  return want(swatch[0], channel(rgb, 16)) && want(swatch[1], channel(rgb, 8)) && want(swatch[2], channel(rgb, 0));
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
function hexRgb(swatch: readonly [number, number, number]): string {
  return ((swatch[0] << 16) | (swatch[1] << 8) | swatch[2]).toString(16).padStart(6, '0');
}
