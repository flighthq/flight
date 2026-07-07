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
// Aabb (axis-aligned bounding box, 3D)
// ---------------------------------------------------------------------------

/// Axis-aligned 3D bounding box, defined by its `min` and `max` corners in a
/// single coordinate space (local-space for `MeshGeometry::bounds`). A box with
/// `min` greater than `max` on any axis is considered empty.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Aabb {
    pub min: Vector3,
    pub max: Vector3,
}

impl Entity for Aabb {}

// ---------------------------------------------------------------------------
// Ray3D
// ---------------------------------------------------------------------------

/// A 3D ray: an origin point and a direction (conventionally unit-length).
/// Points along the ray are parameterized as `origin + t * direction` for
/// `t >= 0`.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Ray3D {
    pub origin: Vector3,
    pub direction: Vector3,
}

impl Entity for Ray3D {}

// ---------------------------------------------------------------------------
// BoundingSphere
// ---------------------------------------------------------------------------

/// Bounding sphere: a center point and a radius. A negative radius
/// conventionally marks an empty sphere.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct BoundingSphere {
    pub center: Vector3,
    pub radius: f32,
}

impl Entity for BoundingSphere {}

// ---------------------------------------------------------------------------
// Plane
// ---------------------------------------------------------------------------

/// A plane in the form `a·x + b·y + c·z + d = 0`. `(a, b, c)` is the plane
/// normal (unit-length when normalized), and `d` is the signed distance from
/// the origin along that normal. The signed distance of a point `p` to the
/// plane is `a·p.x + b·p.y + c·p.z + d`; positive is the side the normal
/// points toward.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Plane {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
}

impl Entity for Plane {}

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

// ---------------------------------------------------------------------------
// Quaternion
// ---------------------------------------------------------------------------

/// Unit quaternion `(x, y, z, w)` for 3D rotation. Handedness is pinned across
/// the 3D suite: right-handed coordinates, CCW front-face, following the glTF /
/// three.js convention.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Quaternion {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

impl Entity for Quaternion {}

/// A `Quaternion`-like value that may not carry full entity identity.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct QuaternionLike {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

/// The order in which per-axis rotations compose when converting between Euler
/// angles and a quaternion or matrix. `XYZ` applies X first, then Y, then Z —
/// the glTF / three.js intrinsic-rotation convention used across the 3D suite.
#[derive(Copy, Clone, PartialEq, Eq, Debug, Default)]
pub enum EulerOrder {
    #[default]
    XYZ,
    XZY,
    YXZ,
    YZX,
    ZXY,
    ZYX,
}

// ---------------------------------------------------------------------------
// Frustum
// ---------------------------------------------------------------------------

/// A view frustum as its six bounding planes, each oriented with its normal
/// pointing inward (toward the contained volume) so a point is inside when its
/// signed distance to every plane is `>= 0`. Built from a view-projection
/// `Matrix4` (`set_frustum_from_matrix4`) and tested against bounds
/// (`is_frustum_intersecting_aabb`).
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Frustum {
    pub bottom: Plane,
    pub far: Plane,
    pub left: Plane,
    pub near: Plane,
    pub right: Plane,
    pub top: Plane,
}

impl Entity for Frustum {}

/// A `Frustum`-like value that may not carry full entity identity.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct FrustumLike {
    pub bottom: Plane,
    pub far: Plane,
    pub left: Plane,
    pub near: Plane,
    pub right: Plane,
    pub top: Plane,
}

// ---------------------------------------------------------------------------
// Obb
// ---------------------------------------------------------------------------

/// Oriented bounding box: a center point, half-extents along the three local
/// axes, and an orientation quaternion mapping local axes to world space. A
/// half-extent of zero on any axis collapses that dimension to a slab or point.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Obb {
    pub center_x: f32,
    pub center_y: f32,
    pub center_z: f32,
    pub half_extent_x: f32,
    pub half_extent_y: f32,
    pub half_extent_z: f32,
    pub orientation_w: f32,
    pub orientation_x: f32,
    pub orientation_y: f32,
    pub orientation_z: f32,
}

impl Entity for Obb {}

/// An `Obb`-like value that may not carry full entity identity.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct ObbLike {
    pub center_x: f32,
    pub center_y: f32,
    pub center_z: f32,
    pub half_extent_x: f32,
    pub half_extent_y: f32,
    pub half_extent_z: f32,
    pub orientation_w: f32,
    pub orientation_x: f32,
    pub orientation_y: f32,
    pub orientation_z: f32,
}

// ---------------------------------------------------------------------------
// Capsule
// ---------------------------------------------------------------------------

/// A capsule: the set of all points within `radius` of the line segment from
/// `(start_x, start_y, start_z)` to `(end_x, end_y, end_z)`. A negative radius
/// conventionally marks an empty capsule.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct Capsule {
    pub end_x: f32,
    pub end_y: f32,
    pub end_z: f32,
    pub radius: f32,
    pub start_x: f32,
    pub start_y: f32,
    pub start_z: f32,
}

impl Entity for Capsule {}

/// A `Capsule`-like value that may not carry full entity identity.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct CapsuleLike {
    pub end_x: f32,
    pub end_y: f32,
    pub end_z: f32,
    pub radius: f32,
    pub start_x: f32,
    pub start_y: f32,
    pub start_z: f32,
}
