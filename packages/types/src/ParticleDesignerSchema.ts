import type { ParticleEmitterConfig } from './ParticleEmitterConfig';

// Particle Designer plist schema — field names as they appear in the XML file.
// Reference: https://www.71squared.com/particledesigner (format documented in the tool's export)
// Targets Particle Designer 3.x and cocos2d-compatible plist files.

export type ParticleDesignerEmitterType = 0 | 1; // 0 = gravity, 1 = radial

export interface ParticleDesignerDocument {
  // Core
  maxParticles: number;
  emitterType: ParticleDesignerEmitterType;
  duration: number; // seconds; -1 = infinite

  // Lifetime (seconds)
  particleLifespan: number;
  particleLifespanVariance: number;

  // Speed (points/sec)
  speed: number;
  speedVariance: number;

  // Direction (degrees: 0=right, 90=up-screen, in Y-down screen space)
  angle: number;
  angleVariance: number;

  // Gravity (points/sec²; positive Y = down on screen)
  gravityx: number;
  gravityy: number;

  // Emitter position variance (used as spawn area half-extents)
  sourcePositionVariancex: number;
  sourcePositionVariancey: number;

  // Scale — absolute pixel size at birth and death
  startParticleSize: number;
  startParticleSizeVariance: number;
  finishParticleSize: number;
  finishParticleSizeVariance: number;

  // Color at birth (0–1 each channel)
  startColorRed: number;
  startColorGreen: number;
  startColorBlue: number;
  startColorAlpha: number;
  startColorVarianceRed: number;
  startColorVarianceGreen: number;
  startColorVarianceBlue: number;
  startColorVarianceAlpha: number;

  // Color at death
  finishColorRed: number;
  finishColorGreen: number;
  finishColorBlue: number;
  finishColorAlpha: number;
  finishColorVarianceRed: number;
  finishColorVarianceGreen: number;
  finishColorVarianceBlue: number;
  finishColorVarianceAlpha: number;

  // Rotation spin (degrees/sec, applies at spawn, constant)
  rotationStart: number;
  rotationStartVariance: number;
  rotationEnd: number;
  rotationEndVariance: number;

  // Radial mode (emitterType === 1) — approximated on import
  maxRadius: number;
  maxRadiusVariance: number;
  minRadius: number;
  minRadiusVariance: number;
  rotatePerSecond: number;
  rotatePerSecondVariance: number;

  // Blend function
  blendFuncSource: number;
  blendFuncDestination: number;

  // Misc
  textureFileName: string;
}

export type ParticleDesignerRawDict = Record<string, string | number | boolean>;

export interface ParticleDesignerParseOptions {
  /** Side length of the particle texture in pixels, used to normalise pixel sizes
   *  to dimensionless scale multipliers.  Defaults to 1 (no normalisation). */
  textureSize?: number;
}

export interface ParticleDesignerParsed {
  config: ParticleEmitterConfig;
  document: ParticleDesignerDocument;
  /** Features present in the source that the common-subset importer cannot
   *  represent and silently dropped — surface these in your asset pipeline. */
  warnings: string[];
}

export interface ParticleDesignerSerializeOptions {
  /** Side length of the particle texture in pixels — reverses the normalisation
   *  applied during parsing.  Defaults to 1. */
  textureSize?: number;
}
