import type { ParticleEmitterConfig, RandomSource } from '@flighthq/types/contract';

const TWO_PI = Math.PI * 2;

/** Write a deterministic 2D spawn-shape offset at `offset` in `out`.
 *
 * Point and zero-size shapes write the origin without drawing from `random`.
 * Circle samples its area, ring samples its circumference, rectangle samples its
 * area, and line samples the horizontal segment from `-width / 2` (inclusive) to
 * `width / 2` (exclusive), matching the SDK `RandomSource` range of `[0, 1)`.
 * Shapes with a 3D interpretation are left at the origin for their caller to
 * handle. */
export function writeParticleSpawnOffset(
  out: number[] | Float32Array,
  offset: number,
  config: Readonly<ParticleEmitterConfig>,
  random: RandomSource,
): void {
  let x = 0;
  let y = 0;
  const shape = config.emitterShape;
  if (shape === 'circle' && config.emitterRadius > 0) {
    const radius = Math.sqrt(random()) * config.emitterRadius;
    const angle = random() * TWO_PI;
    x = Math.cos(angle) * radius;
    y = Math.sin(angle) * radius;
  } else if (shape === 'line' && config.emitterWidth > 0) {
    x = (random() - 0.5) * config.emitterWidth;
  } else if (shape === 'rect' && (config.emitterWidth > 0 || config.emitterHeight > 0)) {
    const xSample = random();
    const ySample = random();
    x = (xSample - 0.5) * config.emitterWidth;
    y = (ySample - 0.5) * config.emitterHeight;
  } else if (shape === 'ring' && config.emitterRadius > 0) {
    const angle = random() * TWO_PI;
    x = Math.cos(angle) * config.emitterRadius;
    y = Math.sin(angle) * config.emitterRadius;
  }

  out[offset] = x;
  out[offset + 1] = y;
}
