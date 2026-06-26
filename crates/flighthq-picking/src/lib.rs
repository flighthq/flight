//! `flighthq-picking` — scene ray-cast picking.
//!
//! Resolves the nearest [`MeshGeometry`](flighthq_types::MeshGeometry) hit by a
//! camera pick ray through a 3D scene, returning a [`SceneHit`] or `None` on a
//! miss. Screen coordinates are NDC in `[-1, 1]`; the viewport→NDC mapping is
//! the caller's responsibility.
//!
//! Ports the TypeScript `@flighthq/picking` package.

pub mod pick_scene;

pub use pick_scene::{SceneHit, pick_scene};
