// Which sink of a DisplayObject an animation channel drives. Vector paths consume two components;
// scalar paths consume one. This is the target-owner vocabulary for generic 2D animation binding.
export type DisplayObjectAnimationPath =
  | 'Alpha'
  | 'Pivot'
  | 'PivotX'
  | 'PivotY'
  | 'Position'
  | 'Rotation'
  | 'Scale'
  | 'ScaleX'
  | 'ScaleY'
  | 'Skew'
  | 'SkewX'
  | 'SkewY'
  | 'Visible'
  | 'X'
  | 'Y';

export const DisplayObjectAnimationPathAlpha = 'Alpha';
export const DisplayObjectAnimationPathPivot = 'Pivot';
export const DisplayObjectAnimationPathPivotX = 'PivotX';
export const DisplayObjectAnimationPathPivotY = 'PivotY';
export const DisplayObjectAnimationPathPosition = 'Position';
export const DisplayObjectAnimationPathRotation = 'Rotation';
export const DisplayObjectAnimationPathScale = 'Scale';
export const DisplayObjectAnimationPathScaleX = 'ScaleX';
export const DisplayObjectAnimationPathScaleY = 'ScaleY';
export const DisplayObjectAnimationPathSkew = 'Skew';
export const DisplayObjectAnimationPathSkewX = 'SkewX';
export const DisplayObjectAnimationPathSkewY = 'SkewY';
export const DisplayObjectAnimationPathVisible = 'Visible';
export const DisplayObjectAnimationPathX = 'X';
export const DisplayObjectAnimationPathY = 'Y';
