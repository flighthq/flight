import type { ParticleEmitterConfig } from './ParticleEmitterConfig';

// Starling / Sparrow PEX particle format schema.
// The PEX format is an XML particle descriptor popularised by the Sparrow framework
// and used by Starling, Cocos2d-x, and various OpenFL/Starling toolchains.
// It differs from Particle Designer's plist in that values are stored as XML attributes
// rather than nested key/value pairs: <attribute name="key" value="val"/>.
//
// Two common sub-variants:
//  - "attribute" style: <attribute name="key" value="v"/> (original Sparrow/Starling)
//  - "element" style: identical to Particle Designer plist (common in some exporters)
// This parser handles both.
//
// Field naming follows the Starling PEX 2.x convention.
// Units: time in seconds, sizes in pixels, angles in degrees.

export interface StarlingPexColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

/** Full Starling PEX particle document. */
export interface StarlingPexDocument {
  maxParticles: number;
  /** Emitter type: 0 = gravity, 1 = radial. */
  emitterType: 0 | 1;
  duration: number;
  particleLifespan: number;
  particleLifespanVariance: number;
  speed: number;
  speedVariance: number;
  angle: number;
  angleVariance: number;
  gravityx: number;
  gravityy: number;
  sourcePositionVariancex: number;
  sourcePositionVariancey: number;
  startParticleSize: number;
  startParticleSizeVariance: number;
  finishParticleSize: number;
  finishParticleSizeVariance: number;
  startColor: StarlingPexColor;
  startColorVariance: StarlingPexColor;
  finishColor: StarlingPexColor;
  finishColorVariance: StarlingPexColor;
  rotationStart: number;
  rotationStartVariance: number;
  rotationEnd: number;
  rotationEndVariance: number;
  maxRadius: number;
  maxRadiusVariance: number;
  minRadius: number;
  minRadiusVariance: number;
  rotatePerSecond: number;
  rotatePerSecondVariance: number;
  radialAcceleration: number;
  radialAccelVariance: number;
  tangentialAcceleration: number;
  tangentialAccelVariance: number;
  blendFuncSource: number;
  blendFuncDestination: number;
  textureFileName: string;
}

export interface StarlingPexParseOptions {
  /** Side length of the particle texture in pixels, used to normalise pixel sizes
   *  to dimensionless scale multipliers. Defaults to 1 (no normalisation). */
  textureSize?: number;
}

export interface StarlingPexParseResult {
  config: ParticleEmitterConfig;
  document: StarlingPexDocument;
  /** Features present in the source that the common-subset importer cannot
   *  represent and silently dropped — surface these in your asset pipeline. */
  warnings: string[];
}

export type StarlingPexParsed = StarlingPexParseResult;

export interface StarlingPexSerializeOptions {
  /** Side length of the particle texture in pixels — reverses the normalisation
   *  applied during parsing. Defaults to 1. */
  textureSize?: number;
}
