// libGDX 2D Particle Editor (.p) format schema.
// Targets the libGDX particle effect format as produced by the libGDX 2D Particle Editor
// (Badlogic Games). The format is a hierarchical key-value text file where property groups
// are introduced by a bare name line and contain `key: value` pairs.
//
// The "Particle Effect" header introduces the whole file; "- Emitter -" marks each emitter.
// Value groups (Emission, Life, etc.) use lowMin/lowMax for the constant-range lower bound
// and highMin/highMax for the high end of the range.
// Curve values use scalingCount + scaling0..N and timelineCount + timeline0..N.
// Units: time in milliseconds, sizes in pixels, angles in degrees.

/** A scalar range value (low..high constant pair). */
export interface LibgdxRangeValue {
  lowMin: number;
  lowMax: number;
  highMin: number;
  highMax: number;
  relative: boolean;
  /** Scaling curve values (parallel to timeline). */
  scaling: number[];
  /** Timeline positions (0–1 normalized). */
  timeline: number[];
}

/** Full libGDX particle emitter document. */
export interface LibgdxParticleDocument {
  /** Emitter name (the string after "- Emitter -"). */
  name: string;
  minParticleCount: number;
  maxParticleCount: number;
  /** Blend mode: true = additive, false = normal (alpha). */
  additive: boolean;
  premultipliedAlpha: boolean;
  delay: LibgdxRangeValue & {
    active: boolean;
  };
  duration: LibgdxRangeValue;
  emission: LibgdxRangeValue;
  life: LibgdxRangeValue;
  lifeOffset: LibgdxRangeValue & {
    active: boolean;
  };
  xOffset: LibgdxRangeValue & {
    active: boolean;
  };
  yOffset: LibgdxRangeValue & {
    active: boolean;
  };
  spawnShape: {
    shape: 'point' | 'line' | 'square' | 'ellipse';
    edges: boolean;
    side: 'both' | 'top' | 'bottom';
  };
  spawnWidth: LibgdxRangeValue;
  spawnHeight: LibgdxRangeValue;
  scale: LibgdxRangeValue;
  velocity: LibgdxRangeValue & {
    active: boolean;
  };
  angle: LibgdxRangeValue & {
    active: boolean;
  };
  rotation: LibgdxRangeValue & {
    active: boolean;
  };
  wind: LibgdxRangeValue & {
    active: boolean;
  };
  gravity: LibgdxRangeValue & {
    active: boolean;
  };
  tint: {
    colors: string[];
    timeline: number[];
  };
  transparency: LibgdxRangeValue;
  imageCount: number;
  imagePath: string;
}
