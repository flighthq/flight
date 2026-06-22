use crate::entity::Entity;

// ---------------------------------------------------------------------------
// Vector types
// ---------------------------------------------------------------------------

/// 2D vector or point.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Vector2 {
    pub x: f32,
    pub y: f32,
}

impl Entity for Vector2 {}

/// A `Vector2`-like value that may not carry full entity identity.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Vector2Like {
    pub x: f32,
    pub y: f32,
}

/// 3D vector or point.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Vector3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Entity for Vector3 {}

/// A `Vector3`-like value that may not carry full entity identity.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Vector3Like {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// 4D vector or homogeneous point.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Vector4 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

impl Entity for Vector4 {}

/// A `Vector4`-like value that may not carry full entity identity.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Vector4Like {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

// ---------------------------------------------------------------------------
// Rectangle
// ---------------------------------------------------------------------------

/// Axis-aligned rectangle.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Rectangle {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl Entity for Rectangle {}

/// A `Rectangle`-like value that may not carry full entity identity.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct RectangleLike {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

// ---------------------------------------------------------------------------
// Matrix types
// ---------------------------------------------------------------------------

/// 2D affine transform matrix (column-major 3×2):
/// ```text
/// | a  c  tx |
/// | b  d  ty |
/// ```
#[derive(Copy, Clone, PartialEq, Debug)]
pub struct Matrix {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub tx: f32,
    pub ty: f32,
}

impl Entity for Matrix {}

impl Default for Matrix {
    fn default() -> Self {
        // Identity
        Self {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 0.0,
            ty: 0.0,
        }
    }
}

/// A `Matrix`-like value (no entity identity).
#[derive(Copy, Clone, PartialEq, Debug)]
pub struct MatrixLike {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub tx: f32,
    pub ty: f32,
}

impl Default for MatrixLike {
    fn default() -> Self {
        Self {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 0.0,
            ty: 0.0,
        }
    }
}

/// 3×3 float matrix stored as a flat 9-element row-major array.
#[derive(Clone, Debug)]
pub struct Matrix3 {
    pub m: [f32; 9],
}

impl Entity for Matrix3 {}

impl Default for Matrix3 {
    fn default() -> Self {
        // Identity
        Self {
            m: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        }
    }
}

/// A `Matrix3`-like value (no entity identity).
#[derive(Clone, Debug)]
pub struct Matrix3Like {
    pub m: [f32; 9],
}

impl Default for Matrix3Like {
    fn default() -> Self {
        Self {
            m: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        }
    }
}

/// 4×4 float matrix stored as a flat 16-element row-major array.
#[derive(Clone, Debug)]
pub struct Matrix4 {
    pub m: [f32; 16],
}

impl Entity for Matrix4 {}

impl Default for Matrix4 {
    fn default() -> Self {
        // Identity
        #[rustfmt::skip]
        let m = [
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ];
        Self { m }
    }
}

/// A `Matrix4`-like value (no entity identity).
#[derive(Clone, Debug)]
pub struct Matrix4Like {
    pub m: [f32; 16],
}

impl Default for Matrix4Like {
    fn default() -> Self {
        #[rustfmt::skip]
        let m = [
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ];
        Self { m }
    }
}
