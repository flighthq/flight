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
pub mod mesh_geometry_attributes;
pub mod mesh_geometry_builders;
pub mod mesh_geometry_compute;
pub mod mesh_geometry_index;
pub mod mesh_geometry_layout;
pub mod mesh_geometry_operations;
pub mod mesh_geometry_subset;
pub mod mesh_geometry_transforms;
pub mod mesh_geometry_uvs;

pub use mesh_geometry::{
    MeshGeometryKindId, MeshGeometryOptions, clone_mesh_geometry, create_mesh_geometry,
    destroy_mesh_geometry_gl_data, destroy_mesh_geometry_wgpu_data, get_mesh_geometry_index_count,
    get_mesh_geometry_vertex_count, get_mesh_kind,
};
pub use mesh_geometry_attributes::{
    get_mesh_geometry_index, get_mesh_geometry_triangle_count, get_mesh_geometry_vertex_position,
};
pub use mesh_geometry_builders::{
    create_box_mesh_geometry, create_cone_mesh_geometry, create_cylinder_mesh_geometry,
    create_plane_mesh_geometry, create_quad_mesh_geometry, create_sphere_mesh_geometry,
    create_torus_mesh_geometry,
};
pub use mesh_geometry_compute::{
    compute_mesh_geometry_bounds, compute_mesh_geometry_normals, compute_mesh_geometry_tangents,
};
pub use mesh_geometry_index::{
    compute_mesh_geometry_wireframe_indices, expand_mesh_geometry_indices,
};
pub use mesh_geometry_layout::{canonical_mesh_geometry_layout, convert_mesh_geometry_layout};
pub use mesh_geometry_operations::{
    MeshGeometryFromAttributesOptions, create_mesh_geometry_from_attributes, merge_mesh_geometries,
    validate_mesh_geometry,
};
pub use mesh_geometry_subset::{
    add_mesh_geometry_subset, get_mesh_geometry_subset_triangle_count, set_mesh_geometry_subsets,
};
pub use mesh_geometry_transforms::{
    center_mesh_geometry, scale_mesh_geometry, transform_mesh_geometry,
    transform_mesh_geometry_into, translate_mesh_geometry,
};
pub use mesh_geometry_uvs::{
    offset_mesh_geometry_uvs, scale_mesh_geometry_uvs, wrap_mesh_geometry_uvs,
};
