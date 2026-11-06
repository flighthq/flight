import type { EntityRaw } from '@flighthq/entity/contract';
import type { RandomSource } from '@flighthq/math/contract';
import type { HasAppearance, HasColorScaleBias, HasTransform2D } from '@flighthq/node/contract';
import type { Signal } from '@flighthq/signals/contract';

import type { ParticleEmitterConfig } from './ParticleEmitterConfig.ts';

export interface ParticleEmitterState extends EntityRaw {
  burstTimer: number;
  colorBirth: Float32Array;
  colorDeath: Float32Array;
  emitterAge: number;
  lifetimes: Float32Array;
  prevX: number;
  prevY: number;
  prevZ: number;
  random: RandomSource;
  rotationSpeeds: Float32Array;
  scales: Float32Array;
  spawnAccumulator: number;
  velocities: Float32Array;
}

export interface ParticleDeathEvent {
  x: number;
  y: number;
  z: number;
}

export interface ParticleSpawnEvent {
  vx: number;
  vy: number;
  vz: number;
  x: number;
  y: number;
  z: number;
}

export interface ParticleEmitterSignals extends EntityRaw {
  onEmitterComplete: Signal<void>;
  onParticleDeath: Signal<Readonly<ParticleDeathEvent>>;
  onParticleSpawn: Signal<Readonly<ParticleSpawnEvent>>;
}

export interface CollisionResponse {
  friction?: number;
  restitution?: number;
}

export interface CircleCollider extends CollisionResponse {
  kind: 'CircleCollider';
  mode: 'exclude' | 'contain';
  radius: number;
  x: number;
  y: number;
}
export const CircleColliderKind = 'CircleCollider';

export interface PlaneCollider extends CollisionResponse {
  distance: number;
  kind: 'PlaneCollider';
  nx: number;
  ny: number;
  nz?: number;
}
export const PlaneColliderKind = 'PlaneCollider';

export interface RectangleCollider extends CollisionResponse {
  height: number;
  kind: 'RectangleCollider';
  mode: 'exclude' | 'contain';
  width: number;
  x: number;
  y: number;
}
export const RectangleColliderKind = 'RectangleCollider';

export interface SphereCollider extends CollisionResponse {
  kind: 'SphereCollider';
  mode: 'contain' | 'exclude';
  radius: number;
  x: number;
  y: number;
  z: number;
}
export const SphereColliderKind = 'SphereCollider';

export type ParticleCollider = CircleCollider | PlaneCollider | RectangleCollider | SphereCollider;

export type ForceFalloff = 'none' | 'linear' | 'inverseSquare';

export interface AttractorForce {
  falloff?: ForceFalloff;
  kind: 'AttractorForce';
  radius?: number;
  strength: number;
  x: number;
  y: number;
  z?: number;
}
export const AttractorForceKind = 'AttractorForce';

export interface DragForce {
  kind: 'DragForce';
  strength: number;
}
export const DragForceKind = 'DragForce';

export interface TurbulenceForce {
  kind: 'TurbulenceForce';
  scale: number;
  strength: number;
}
export const TurbulenceForceKind = 'TurbulenceForce';

export interface VortexForce {
  axisX?: number;
  axisY?: number;
  axisZ?: number;
  falloff?: ForceFalloff;
  kind: 'VortexForce';
  radius?: number;
  strength: number;
  x: number;
  y: number;
  z?: number;
}
export const VortexForceKind = 'VortexForce';

export interface WindForce {
  kind: 'WindForce';
  x: number;
  y: number;
  z?: number;
}
export const WindForceKind = 'WindForce';

export type ParticleForce = AttractorForce | DragForce | TurbulenceForce | VortexForce | WindForce;

export interface CurlNoiseForce {
  kind: 'CurlNoiseForce';
  scale: number;
  strength: number;
  time?: number;
}
export const CurlNoiseForceKind = 'CurlNoiseForce';

export interface PointGravityWellForce {
  falloff?: ForceFalloff;
  kind: 'PointGravityWellForce';
  minRadius?: number;
  radius?: number;
  repulse?: boolean;
  strength: number;
  x: number;
  y: number;
}
export const PointGravityWellForceKind = 'PointGravityWellForce';

export type ParticleObject = HasTransform2D & HasAppearance & HasColorScaleBias;

export interface ParticleObjectsState extends EntityRaw {
  burstTimer: number;
  emitterAge: number;
  lifetimes: Float32Array;
  prevX: number;
  prevY: number;
  random: RandomSource;
  rotationSpeeds: Float32Array;
  scales: Float32Array;
  spawnAccumulator: number;
  velocities: Float32Array;
}

export interface ParticleObjectsUpdateOptions {
  callbacks?: {
    onDeath?: (x: number, y: number, z: number) => void;
    onSpawn?: (x: number, y: number, z: number) => void;
  };
  emitterX?: number;
  emitterY?: number;
}

export interface ParticleBurstEntry {
  readonly count: number;
  readonly cycles: number;
  readonly interval: number;
  readonly time: number;
}
export type ParticleBurstSchedule = ReadonlyArray<ParticleBurstEntry>;

export interface ParticleConfigIssue {
  field: keyof ParticleEmitterConfig;
  message: string;
  severity: 'error' | 'warning';
}
