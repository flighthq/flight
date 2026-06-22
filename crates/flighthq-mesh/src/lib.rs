//! `flighthq-mesh` — mesh geometry: vertex layouts, primitive builders, and
//! normals/tangents/bounds.
//!
//! Ports the TypeScript `@flighthq/mesh` package. The shared header types
//! ([`MeshGeometry`], [`VertexAttributeLayout`], etc.) live in `flighthq-types`;
//! this crate owns the constructors, primitive builders, and compute passes.
//!
//! Faithful port of `@flighthq/mesh`, including its unit tests (ported
//! assertions colocated per source file).

pub mod mesh_geometry;
pub mod mesh_geometry_builders;
pub mod mesh_geometry_compute;

pub use mesh_geometry::{
    MeshGeometryKindId, MeshGeometryOptions, clone_mesh_geometry, create_mesh_geometry,
    destroy_mesh_geometry_gl_data, destroy_mesh_geometry_wgpu_data, get_mesh_geometry_index_count,
    get_mesh_geometry_vertex_count, get_mesh_kind,
};
pub use mesh_geometry_builders::{
    create_box_mesh_geometry, create_cone_mesh_geometry, create_cylinder_mesh_geometry,
    create_plane_mesh_geometry, create_quad_mesh_geometry, create_sphere_mesh_geometry,
    create_torus_mesh_geometry,
};
pub use mesh_geometry_compute::{
    compute_mesh_geometry_bounds, compute_mesh_geometry_normals, compute_mesh_geometry_tangents,
};
