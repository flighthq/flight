// Unity Shuriken particle system JSON schema.
// Based on the Unity Particle System component's serialized field names as exported
// by Unity's JsonUtility and common third-party particle-system exporters.
// Targets Unity 2021 LTS and later.
//
// Curves (MinMaxCurve) are simplified to constant or two-keyframe linear values.
// Gradients (MinMaxGradient) are simplified to start/end color stops.

export type UnityParticleShapeType =
  | 'Sphere'
  | 'Hemisphere'
  | 'Cone'
  | 'Box'
  | 'Circle'
  | 'Edge'
  | 'Rectangle'
  | 'Donut';

export interface UnityColor {
  r: number; // 0–1
  g: number; // 0–1
  b: number; // 0–1
  a: number; // 0–1
}

/** A two-value range used for min/max curves with constant mode. */
export interface UnityMinMaxValue {
  mode: 'constant' | 'twoConstants' | 'curve' | 'twoCurves';
  constant?: number;
  constantMin?: number;
  constantMax?: number;
}

export interface UnityBurst {
  time: number; // seconds into particle system lifetime
  count: number; // particles per burst
  cycleCount: number; // 0 = infinite
  repeatInterval: number; // seconds
}

export interface UnityEmission {
  rateOverTime: UnityMinMaxValue;
  bursts: UnityBurst[];
}

export interface UnityShape {
  enabled: boolean;
  shapeType: UnityParticleShapeType;
  /** Sphere / Hemisphere / Circle / Donut outer radius */
  radius: number;
  /** Cone angle (degrees) */
  angle: number;
  /** Box / Rectangle dimensions */
  scale: { x: number; y: number; z: number };
}

/** A Unity gradient key (RGB stop at a normalised lifetime position). */
export interface UnityGradientColorKey {
  time: number; // 0–1
  color: { r: number; g: number; b: number };
}

/** A Unity gradient alpha key. */
export interface UnityGradientAlphaKey {
  time: number; // 0–1
  alpha: number;
}

/** Multi-stop gradient (full MinMaxGradient fidelity). */
export interface UnityGradient {
  colorKeys: UnityGradientColorKey[];
  alphaKeys: UnityGradientAlphaKey[];
}

/** A Unity AnimationCurve key. */
export interface UnityCurveKey {
  time: number; // 0–1
  value: number;
}

/** Multi-key AnimationCurve. */
export interface UnityAnimationCurve {
  keys: UnityCurveKey[];
}

export interface UnityColorOverLifetime {
  enabled: boolean;
  /** Color at start and end of lifetime */
  colorStart: UnityColor;
  colorEnd: UnityColor;
  /** Full multi-stop gradient; when present it carries the complete color/alpha
   *  timeline that colorStart/colorEnd only approximate. */
  gradient?: UnityGradient;
}

export interface UnitySizeOverLifetime {
  enabled: boolean;
  /** Size multiplier at start and end of lifetime */
  sizeStart: number;
  sizeEnd: number;
  /** Full AnimationCurve; when present it carries the complete size-over-lifetime shape. */
  curve?: UnityAnimationCurve;
}

export interface UnityRotationOverLifetime {
  enabled: boolean;
  /** Angular velocity in degrees/sec */
  angularVelocity: UnityMinMaxValue;
}

/** Full Unity Shuriken particle system JSON document. */
export interface UnityParticleDocument {
  name: string;
  duration: number; // seconds
  looping: boolean;
  prewarm: boolean;
  maxParticles: number;
  startLifetime: UnityMinMaxValue;
  startSpeed: UnityMinMaxValue;
  startSize: UnityMinMaxValue;
  startRotation: UnityMinMaxValue; // degrees
  startColor: UnityColor;
  gravityModifier: number; // multiplier on Physics.gravity (default 9.81 m/s² downward)
  physicsGravity: number; // world gravity magnitude (m/s²); default 9.81
  emission: UnityEmission;
  shape: UnityShape;
  colorOverLifetime: UnityColorOverLifetime;
  sizeOverLifetime: UnitySizeOverLifetime;
  rotationOverLifetime: UnityRotationOverLifetime;
}
