// How an AnimationTrack interpolates between keyframes. 'Step' holds the previous keyframe's value;
// 'Linear' interpolates component-wise (or slerps a quaternion track); 'Cubic' is a glTF-style cubic
// spline where each keyframe stores in-tangent, value, and out-tangent (3 * components per keyframe).
export type AnimationInterpolation = 'Cubic' | 'Linear' | 'Step';

export const AnimationInterpolationCubic = 'Cubic';
export const AnimationInterpolationLinear = 'Linear';
export const AnimationInterpolationStep = 'Step';
