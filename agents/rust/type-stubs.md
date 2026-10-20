# Type Stubs

When a module references types from another module (e.g., `Vector2` uses `Vector3` for `set_vector2_from_vector3`), the referenced type must exist as a stub so the crate compiles.

## Stub pattern

A minimal stub provides: the struct, a `Default` impl (when non-trivial), `create_*`, `initialize_*`, and an impl `new`.

```rust
use crate::Vector3;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BoundingSphere {
    pub center: Vector3,
    pub radius: f32,
}

impl Default for BoundingSphere {
    fn default() -> Self {
        return BoundingSphere {
            center: Vector3 { x: 0.0, y: 0.0, z: 0.0 },
            radius: -1.0,
        };
    }
}

pub fn create_bounding_sphere(
    center_x: f32, center_y: f32, center_z: f32, radius: f32,
) -> BoundingSphere {
    let mut out = BoundingSphere::default();
    initialize_bounding_sphere(&mut out, center_x, center_y, center_z, radius);
    return out;
}

pub fn initialize_bounding_sphere(
    out: &mut BoundingSphere,
    center_x: f32, center_y: f32, center_z: f32, radius: f32,
) {
    out.center.x = center_x;
    out.center.y = center_y;
    out.center.z = center_z;
    out.radius = radius;
}

impl BoundingSphere {
    pub fn new(center_x: f32, center_y: f32, center_z: f32, radius: f32) -> Self {
        return create_bounding_sphere(center_x, center_y, center_z, radius);
    }
}
```

## Struct field conventions

- **Nested structs** (e.g., `center: Vector3`): used when the TS type nests objects
- **Flat scalars** (e.g., `center_x: f32, center_y: f32, center_z: f32`): used when the TS type has flat numeric fields (Capsule, Obb)
- Match the TS original — don't restructure

## Default values

Match the TS defaults:
- Vectors: all zeros
- Quaternion: `(0, 0, 0, 1)` (identity rotation)
- Matrices: identity matrix
- BoundingSphere: radius `-1.0` (empty)
- Transform2D: scale `(1, 1)`, rest zero
- Transform3D: scale `(1, 1, 1)`, rotation identity, position zero

## Derives

All geometry types derive `Debug, Clone, Copy, PartialEq`. Add `Default` only when the default is all-zeros (otherwise write `impl Default` manually).

## Registration

Every new module must be declared in `lib.rs`:
```rust
mod bounding_sphere;
pub use bounding_sphere::*;
```

Modules in `lib.rs` are alphabetically ordered.
