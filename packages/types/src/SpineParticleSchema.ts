import type { ParticleEmitterConfig } from './ParticleEmitterConfig';

// Spine particle effect JSON schema.
// Targets the Spine 4.x particle effect format (`.p` JSON variant) as documented by
// Esoteric Software: https://esotericsoftware.com/spine-particle-effects
//
// Field naming follows the Spine editor export conventions.
// Units: time in milliseconds, sizes in pixels, angles in degrees.

export type SpineBlendMode = 'normal' | 'additive' | 'multiply' | 'screen';

export interface SpineRangeValue {
  low: number;
  high: number;
}

export interface SpineAlphaKeyframe {
  time: number; // 0–1 normalised lifetime fraction
  alpha: number; // 0–1
}

export interface SpineTintKeyframe {
  time: number;
  color: string; // hex RRGGBB e.g. "ff7700"
}

/** Full Spine particle effect document. */
export interface SpineParticleDocument {
  name: string;

  // Capacity
  maxParticles: number;
  continuous: boolean;
  duration: number; // milliseconds; -1 = infinite

  // Emission (particles per second)
  emission: SpineRangeValue;

  // Lifetime (milliseconds)
  life: SpineRangeValue;
  lifeOffset: SpineRangeValue;

  // Spawn position
  x: SpineRangeValue;
  y: SpineRangeValue;
  spawnShape: 'point' | 'ellipse' | 'line';
  spawnWidth: SpineRangeValue;
  spawnHeight: SpineRangeValue;

  // Physics
  velocity: SpineRangeValue; // pixels/sec
  angle: SpineRangeValue; // degrees; 0=right, 90=up-screen
  rotation: SpineRangeValue; // degrees/sec spin
  wind: SpineRangeValue; // pixels/sec horizontal acceleration
  gravity: SpineRangeValue; // pixels/sec² downward (positive = down-screen)

  // Appearance
  scale: SpineRangeValue;
  scaleEnd: SpineRangeValue;
  tint: SpineTintKeyframe[];
  alpha: SpineAlphaKeyframe[];
  blendMode: SpineBlendMode;
  premultiplied: boolean;

  // Images (first entry used for config mapping)
  images: string[];
}

export interface SpineParsed {
  config: ParticleEmitterConfig;
  document: SpineParticleDocument;
  /** Features present in the source that the common-subset importer cannot
   *  represent and silently dropped — surface these in your asset pipeline. */
  warnings: string[];
}
