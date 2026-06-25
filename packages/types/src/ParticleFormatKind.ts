/** Identifies the Particle Designer plist XML format (71squared / cocos2d). */
export const ParticleDesignerFormatKind = 'ParticleDesigner';
/** Identifies the Spine 4.x particle effect JSON format (Esoteric Software). */
export const SpineParticleFormatKind = 'Spine';
/** Identifies the Unity Shuriken particle system JSON format (Unity Technologies). */
export const UnityParticleFormatKind = 'Unity';
/** Identifies the libGDX 2D Particle Editor `.p` format (Badlogic Games). */
export const LibgdxParticleFormatKind = 'Libgdx';
/** Identifies the Starling / Sparrow PEX particle XML format. */
export const StarlingPexFormatKind = 'StarlingPex';
/** Identifies the Pixi.js / pixi-particle-emitter JSON format. */
export const PixiParticleFormatKind = 'Pixi';
/** Identifies the Phaser particle manager JSON format (Phaser 3+). */
export const PhaserParticleFormatKind = 'Phaser';
/** Union of the string constants above. Extend via `registerParticleFormat` for
 *  custom / vendor-namespaced formats — this union covers the built-in set only. */
export type ParticleFormatKind =
  | typeof ParticleDesignerFormatKind
  | typeof SpineParticleFormatKind
  | typeof UnityParticleFormatKind
  | typeof LibgdxParticleFormatKind
  | typeof StarlingPexFormatKind
  | typeof PixiParticleFormatKind
  | typeof PhaserParticleFormatKind
  | (string & Record<never, never>);
