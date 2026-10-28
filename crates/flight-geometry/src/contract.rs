//! The full contract lane, mirroring TS `contract.ts`: every public free function and type.
//! Consumers that need the complete surface (other Flight crates, internal seams) import here;
//! the crate root exposes only the curated public lane from TS `index.ts`.

pub use super::aabb::*;
pub use super::bounding_sphere::*;
pub use super::capsule::*;
pub use super::enable_geometry_pool_guards::*;
pub use super::frustum::*;
pub use super::geometry_pool_guards::*;
pub use super::matrix::*;
pub use super::matrix_pool::*;
pub use super::matrix3::*;
pub use super::matrix3_pool::*;
pub use super::matrix4::*;
pub use super::matrix4_pool::*;
pub use super::obb::*;
pub use super::plane::*;
pub use super::quaternion::*;
pub use super::quaternion_pool::*;
pub use super::ray3d::*;
pub use super::rectangle::*;
pub use super::rectangle_pool::*;
pub use super::transform2d::*;
pub use super::transform3d::*;
pub use super::typedarray::*;
pub use super::vector2::*;
pub use super::vector2_pool::*;
pub use super::vector3::*;
pub use super::vector3_pool::*;
pub use super::vector4::*;
pub use super::vector4_pool::*;
