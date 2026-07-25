// Which sink of a Node2D an animation channel drives. Vector paths consume two components;
// scalar paths consume one. This is the target-owner vocabulary for generic 2D animation binding.
export type Node2DAnimationPath =
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

export const Node2DAnimationPathAlpha = 'Alpha';
export const Node2DAnimationPathPivot = 'Pivot';
export const Node2DAnimationPathPivotX = 'PivotX';
export const Node2DAnimationPathPivotY = 'PivotY';
export const Node2DAnimationPathPosition = 'Position';
export const Node2DAnimationPathRotation = 'Rotation';
export const Node2DAnimationPathScale = 'Scale';
export const Node2DAnimationPathScaleX = 'ScaleX';
export const Node2DAnimationPathScaleY = 'ScaleY';
export const Node2DAnimationPathSkew = 'Skew';
export const Node2DAnimationPathSkewX = 'SkewX';
export const Node2DAnimationPathSkewY = 'SkewY';
export const Node2DAnimationPathVisible = 'Visible';
export const Node2DAnimationPathX = 'X';
export const Node2DAnimationPathY = 'Y';
