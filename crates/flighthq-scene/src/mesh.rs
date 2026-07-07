//! Mesh scene nodes — the drawable 3D leaf of the scene graph.
//!
//! A Mesh is a [`SceneNode`](crate::SceneNode) (so it shares the scene
//! hierarchy with group nodes and other meshes) carrying a [`Mesh`] payload:
//! `geometry` plus one positional `materials` entry per geometry subset. The
//! presence of that payload is what makes a node a Mesh — [`is_mesh`] tests it,
//! independent of any kind identifier.
//!
//! Ports the TS `@flighthq/scene` `mesh.ts`. In the arena model `create_mesh`
//! returns the node's [`NodeId`]; the entity-model runtime accessor
//! [`get_mesh_runtime`] parallels the TS `getMeshRuntime` over the entity form
//! (`SceneNodeEntity`), matching how the crate already splits
//! [`crate::scene_node`] (arena) from [`crate::scene_runtime`] (entity).

use std::sync::Arc;

use flighthq_node::NodeId;
use flighthq_types::{Material, Mesh, MeshGeometry, NodeSignals};

use crate::scene_node::{
    SceneArena, create_scene_node, enable_scene_node_signals, get_scene_node_signals,
};
use crate::scene_runtime::{SceneNodeEntity, SceneNodeRuntime, get_scene_node_runtime};

/// A Mesh shares its runtime with a plain scene node (the TS `MeshRuntime =
/// SceneNodeRuntime` alias).
pub type MeshRuntime = SceneNodeRuntime;

/// Allocates a renderable Mesh node in `arena` and returns its [`NodeId`]: a
/// scene node carrying `geometry` and one `materials` entry per geometry subset
/// (indexed positionally; a missing or `None` slot resolves to the default
/// material at draw time). The node has an identity local matrix and no
/// children. `geometry` and `materials` are stored by reference (`Arc`), not
/// copied.
///
/// TS↔Rust divergence: the TS `createMesh` takes an optional `kind` argument to
/// mint a custom-kind mesh. The Rust arena `SceneNode` has no per-node kind slot
/// (kind identity is global via [`get_scene_node_kind`](crate::get_scene_node_kind)),
/// so no `kind` parameter is exposed; `is_mesh` is kind-independent regardless.
pub fn create_mesh(
    arena: &mut SceneArena,
    geometry: Arc<MeshGeometry>,
    materials: Vec<Option<Arc<dyn Material>>>,
    name: Option<String>,
) -> NodeId {
    let node = create_scene_node(arena, name);
    arena[node].mesh = Some(Mesh {
        geometry,
        materials,
    });
    node
}

/// Enables child-change signal delivery for the Mesh `source`, allocating a
/// [`NodeSignals`] instance on the node if not already present. Delegates to
/// [`enable_scene_node_signals`].
pub fn enable_mesh_signals(arena: &mut SceneArena, source: NodeId) -> &mut NodeSignals {
    enable_scene_node_signals(arena, source)
}

/// Returns the entity-model runtime for a Mesh `source` (the TS `getMeshRuntime`,
/// which resolves to `getSceneNodeRuntime`).
pub fn get_mesh_runtime(source: &SceneNodeEntity) -> &SceneNodeRuntime {
    get_scene_node_runtime(source)
}

/// Returns the Mesh `source`'s [`NodeSignals`], or `None` when signals have not
/// been enabled. Delegates to [`get_scene_node_signals`].
pub fn get_mesh_signals(arena: &SceneArena, source: NodeId) -> Option<&NodeSignals> {
    get_scene_node_signals(arena, source)
}

/// A node is a Mesh — a drawable leaf, not a transform-only group — when it
/// carries a mesh payload. Robust across custom kinds, so the scene render pass
/// discriminates by this rather than by kind identifier.
pub fn is_mesh(arena: &SceneArena, node: NodeId) -> bool {
    arena[node].mesh.is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{
        Entity, KindId, MeshSubset, PrimitiveTopology, VertexAttribute, VertexAttributeLayout,
        VertexFormat, VertexSemantic,
    };

    #[derive(Debug)]
    struct TestMaterial;
    impl Entity for TestMaterial {}
    impl Material for TestMaterial {
        fn kind(&self) -> KindId {
            KindId::of::<TestMaterial>()
        }
    }

    // A minimal position-only box geometry centered at the origin with the given
    // half-extent on each axis (bounds [-half, half]).
    fn box_geometry(half: f32) -> Arc<MeshGeometry> {
        let h = half;
        #[rustfmt::skip]
        let vertices = vec![
            -h, -h, -h,  h, -h, -h,  h,  h, -h, -h,  h, -h,
            -h, -h,  h,  h, -h,  h,  h,  h,  h, -h,  h,  h,
        ];
        Arc::new(MeshGeometry {
            bounds: None,
            indices: None,
            layout: VertexAttributeLayout {
                attributes: vec![VertexAttribute {
                    byte_offset: 0,
                    format: VertexFormat::Float32x3,
                    semantic: VertexSemantic::Position,
                }],
                stride: 12,
            },
            subsets: vec![MeshSubset {
                index_count: 0,
                index_offset: 0,
            }],
            topology: PrimitiveTopology::TriangleList,
            version: 0,
            vertices,
        })
    }

    // create_mesh

    #[test]
    fn create_mesh_stores_geometry_by_reference() {
        let mut arena = SceneArena::new();
        let geometry = box_geometry(0.5);
        let mesh = create_mesh(&mut arena, Arc::clone(&geometry), vec![], None);
        let stored = &arena[mesh].mesh.as_ref().unwrap().geometry;
        assert!(Arc::ptr_eq(stored, &geometry));
    }

    #[test]
    fn create_mesh_stores_materials_positionally() {
        let mut arena = SceneArena::new();
        let mesh = create_mesh(
            &mut arena,
            box_geometry(0.5),
            vec![Some(Arc::new(TestMaterial)), None],
            None,
        );
        let materials = &arena[mesh].mesh.as_ref().unwrap().materials;
        assert_eq!(materials.len(), 2);
        assert!(materials[0].is_some());
        assert!(materials[1].is_none());
    }

    #[test]
    fn create_mesh_defaults_enabled_and_identity_matrix() {
        let mut arena = SceneArena::new();
        let mesh = create_mesh(&mut arena, box_geometry(0.5), vec![], None);
        assert!(arena[mesh].enabled);
        assert_eq!(arena[mesh].name, None);
        let m = &arena[mesh].local_matrix.m;
        assert_eq!(m[0], 1.0);
        assert_eq!(m[5], 1.0);
        assert_eq!(m[10], 1.0);
        assert_eq!(m[15], 1.0);
    }

    // enable_mesh_signals / get_mesh_signals

    #[test]
    fn enable_mesh_signals_is_idempotent() {
        let mut arena = SceneArena::new();
        let mesh = create_mesh(&mut arena, box_geometry(0.5), vec![], None);
        let first = enable_mesh_signals(&mut arena, mesh) as *const NodeSignals;
        let second = enable_mesh_signals(&mut arena, mesh) as *const NodeSignals;
        assert_eq!(first, second);
    }

    #[test]
    fn get_mesh_signals_none_before_enable_some_after() {
        let mut arena = SceneArena::new();
        let mesh = create_mesh(&mut arena, box_geometry(0.5), vec![], None);
        assert!(get_mesh_signals(&arena, mesh).is_none());
        enable_mesh_signals(&mut arena, mesh);
        assert!(get_mesh_signals(&arena, mesh).is_some());
    }

    // get_mesh_runtime

    #[test]
    fn get_mesh_runtime_returns_initial_entity_runtime() {
        let entity = SceneNodeEntity {
            enabled: true,
            name: None,
            runtime: crate::scene_runtime::create_scene_node_runtime(),
        };
        let runtime = get_mesh_runtime(&entity);
        assert!(runtime.node.children.is_none());
        assert!(runtime.node.parent.is_none());
        assert!(runtime.world_matrix.is_none());
    }

    // is_mesh

    #[test]
    fn is_mesh_true_for_created_mesh() {
        let mut arena = SceneArena::new();
        let mesh = create_mesh(&mut arena, box_geometry(0.5), vec![], None);
        assert!(is_mesh(&arena, mesh));
    }

    #[test]
    fn is_mesh_false_for_bare_scene_node() {
        let mut arena = SceneArena::new();
        let group = create_scene_node(&mut arena, None);
        assert!(!is_mesh(&arena, group));
    }
}
