export type ParticleCurve = ReadonlyArray<number>;

export interface CurveKeyframe {
  time: number;
  value: number;
}

export interface ColorKeyframe {
  time: number;
  r: number;
  g: number;
  b: number;
}
