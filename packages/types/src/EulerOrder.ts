// The order in which per-axis rotations are composed when converting between Euler angles and a
// quaternion or matrix. Each value lists the axes in application order; 'XYZ' applies the X
// rotation first, then Y, then Z. Matches the glTF / three.js intrinsic-rotation convention used
// across the 3D suite.
export type EulerOrder = 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX';
