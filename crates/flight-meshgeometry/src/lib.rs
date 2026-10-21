mod mesh_geometry;
mod mesh_geometry_attributes;
mod mesh_geometry_builders;
mod mesh_geometry_compute;
mod mesh_geometry_deformation_clone;
mod mesh_geometry_index;
mod mesh_geometry_layout;
mod mesh_geometry_operations;
mod mesh_geometry_subset;
mod mesh_geometry_transforms;
mod mesh_geometry_uvs;
mod morph_mesh_geometry;
mod update_mesh_morph;
mod vertex_format;

pub mod contract;

pub use mesh_geometry::{
    IndexBuffer,
    IndexBufferU16,
    IndexBufferU32,
    Mesh,
    MeshGeometry,
    MeshGeometryOptions,
    MeshGeometryFromAttributesOptions,
    MeshMorph,
    MeshMorphBindPose,
    MeshMorphTarget,
    MeshSkinBindPose,
    MeshSubset,
    MeshTriangleVertexIndices,
    PrimitiveTopology,
    clone_mesh_geometry,
    clone_mesh_geometry_metadata,
    create_mesh_geometry,
    destroy_mesh_geometry_gl_data,
    destroy_mesh_geometry_wgpu_data,
    get_mesh_geometry_index_count,
    get_mesh_geometry_morph_bind_pose,
    get_mesh_geometry_skin_bind_pose,
    get_mesh_geometry_vertex_count,
    has_mesh_geometry_skin,
    invalidate_mesh_geometry,
    set_mesh_geometry_morph_bind_pose,
    set_mesh_geometry_skin_bind_pose
};
pub use mesh_geometry_attributes::*;
pub use mesh_geometry_builders::*;
pub use mesh_geometry_compute::{compute_mesh_geometry_bounding_sphere, compute_mesh_geometry_bounds, compute_mesh_geometry_flat_normals, compute_mesh_geometry_normals, compute_mesh_geometry_position_groups, compute_mesh_geometry_tangents, refresh_mesh_geometry_bounds};
pub use mesh_geometry_deformation_clone::*;
pub use mesh_geometry_index::*;
pub use mesh_geometry_layout::*;
pub use mesh_geometry_operations::*;
pub use mesh_geometry_subset::*;
pub use mesh_geometry_transforms::*;
pub use mesh_geometry_uvs::*;
pub use morph_mesh_geometry::*;
pub use update_mesh_morph::*;
pub use vertex_format::{VertexFormat, VertexSemantic, VertexAttribute, VertexAttributeLayout};
pub(crate) use vertex_format::{get_vertex_format_byte_length, get_vertex_format_component_count, read_vertex_format_component, write_vertex_format_component, is_float32_format};
