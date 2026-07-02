export interface StrokeStyle {
  cap?: 'butt' | 'round' | 'square';
  dash?: number[];
  dashOffset?: number;
  join?: 'bevel' | 'miter' | 'round';
  miterLimit?: number;
  width?: number;
}
