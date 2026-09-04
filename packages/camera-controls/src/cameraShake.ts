import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clamp } from '@flighthq/math/contract';
import type { CameraShake, CameraShakeOffset, CameraShakeOptions, EntityConstruction } from '@flighthq/types/contract';

export function addCameraShakeTrauma(shake: CameraShake, amount: number): void {
  shake.trauma = clamp(shake.trauma + amount, 0, 1);
}

export function createCameraShake(options?: Readonly<CameraShakeOptions>): CameraShake {
  const out = allocateEntity<CameraShake>();
  initializeCameraShake(out, options);
  return finishEntity(out);
}

export function createCameraShakeOffset(): CameraShakeOffset {
  const out = allocateEntity<CameraShakeOffset>();
  initializeCameraShakeOffset(out);
  return finishEntity(out);
}

export function initializeCameraShake(
  out: EntityConstruction<CameraShake>,
  options?: Readonly<CameraShakeOptions>,
): void {
  out.decay = options?.decay ?? 1.5;
  out.frequency = options?.frequency ?? 15;
  out.rotationAmplitude = options?.rotationAmplitude ?? 3;
  out.time = 0;
  out.translationAmplitude = options?.translationAmplitude ?? 0.5;
  out.trauma = 0;
}

export function initializeCameraShakeOffset(out: EntityConstruction<CameraShakeOffset>): void {
  out.rotationX = 0;
  out.rotationY = 0;
  out.rotationZ = 0;
  out.x = 0;
  out.y = 0;
  out.z = 0;
}

export function resetCameraShake(shake: CameraShake): void {
  shake.trauma = 0;
  shake.time = 0;
}

// Advances the shake clock by `dt`, decays trauma, and writes the resulting additive offset into
// `out`. When trauma is zero the output is zeroed and no work is done beyond the decay check.
// The noise uses three incommensurate sine phases per axis — cheap, deterministic, and smooth.
export function updateCameraShake(shake: CameraShake, dt: number, out: CameraShakeOffset): void {
  shake.time += dt;
  shake.trauma = Math.max(0, shake.trauma - shake.decay * dt);

  if (shake.trauma <= 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    out.rotationX = 0;
    out.rotationY = 0;
    out.rotationZ = 0;
    return;
  }

  const intensity = shake.trauma * shake.trauma;
  const t = shake.time * shake.frequency;

  const tx = sampleNoise(t, SEED_TX_A, SEED_TX_B, SEED_TX_C);
  const ty = sampleNoise(t, SEED_TY_A, SEED_TY_B, SEED_TY_C);
  const tz = sampleNoise(t, SEED_TZ_A, SEED_TZ_B, SEED_TZ_C);
  const rx = sampleNoise(t, SEED_RX_A, SEED_RX_B, SEED_RX_C);
  const ry = sampleNoise(t, SEED_RY_A, SEED_RY_B, SEED_RY_C);
  const rz = sampleNoise(t, SEED_RZ_A, SEED_RZ_B, SEED_RZ_C);

  out.x = tx * intensity * shake.translationAmplitude;
  out.y = ty * intensity * shake.translationAmplitude;
  out.z = tz * intensity * shake.translationAmplitude;
  out.rotationX = rx * intensity * shake.rotationAmplitude;
  out.rotationY = ry * intensity * shake.rotationAmplitude;
  out.rotationZ = rz * intensity * shake.rotationAmplitude;
}

// Three-frequency sine composite in [-1, 1]. The frequencies are incommensurate (prime-ratio
// multiples) so the combined signal has no visible loop period within any realistic shake duration.
function sampleNoise(t: number, seedA: number, seedB: number, seedC: number): number {
  return (Math.sin(t * seedA) + Math.sin(t * seedB) + Math.sin(t * seedC)) / 3;
}

// Frequency multipliers — irrational-ratio primes keep the combined waveform aperiodic.
const SEED_TX_A = 1.0;
const SEED_TX_B = 2.31;
const SEED_TX_C = 3.53;
const SEED_TY_A = 1.17;
const SEED_TY_B = 2.63;
const SEED_TY_C = 3.89;
const SEED_TZ_A = 1.37;
const SEED_TZ_B = 2.41;
const SEED_TZ_C = 3.71;
const SEED_RX_A = 1.53;
const SEED_RX_B = 2.79;
const SEED_RX_C = 3.47;
const SEED_RY_A = 1.71;
const SEED_RY_B = 2.17;
const SEED_RY_C = 3.91;
const SEED_RZ_A = 1.89;
const SEED_RZ_B = 2.53;
const SEED_RZ_C = 3.29;
