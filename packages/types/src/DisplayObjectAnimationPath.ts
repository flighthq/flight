// Which sink of a DisplayObject an animation channel drives. Vector paths consume two components;
// scalar paths consume one. This is the target-owner vocabulary for generic 2D animation binding.
export type DisplayObjectAnimationPath = 'Alpha' | 'Pivot' | 'Position' | 'Rotation' | 'Scale' | 'Skew' | 'Visible';

export const DisplayObjectAnimationPathAlpha = 'Alpha';
export const DisplayObjectAnimationPathPivot = 'Pivot';
export const DisplayObjectAnimationPathPosition = 'Position';
export const DisplayObjectAnimationPathRotation = 'Rotation';
export const DisplayObjectAnimationPathScale = 'Scale';
export const DisplayObjectAnimationPathSkew = 'Skew';
export const DisplayObjectAnimationPathVisible = 'Visible';
