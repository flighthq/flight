//! Entity-model runtime for `WorldNode`, a faithful port of the
//! `createWorldNodeRuntime` / `getWorldNodeRuntime` pair in the TypeScript
//! `worldNode.ts`.
//!
//! The arena model in [`crate::world_node`] is the data-oriented core. This
//! module ports the TS *entity/runtime* shape: a [`WorldNodeRuntime`] is the
//! base [`flighthq_node::NodeRuntime`] extended with the 3D `world_matrix`
//! cache slot (the TS `HasTransform3DRuntime.worldMatrix`), and an entity-style
//! [`WorldNodeEntity`] pairs node data with that runtime.

use flighthq_node::{NodeRuntime, create_node_runtime};
use flighthq_types::Matrix4;

/// Package-private runtime state attached to a world-graph entity node.
///
/// Mirrors the TS `WorldNodeRuntime = NodeRuntime & HasTransform3DRuntime`:
/// the base node revision counters and links, plus the lazily computed
/// `world_matrix` (`None` until first computed).
pub struct WorldNodeRuntime {
    pub node: NodeRuntime,
    pub world_matrix: Option<Matrix4>,
}

/// An entity-model world node: node data paired with a [`WorldNodeRuntime`].
pub struct WorldNodeEntity {
    pub enabled: bool,
    pub name: Option<String>,
    pub runtime: WorldNodeRuntime,
}

/// Creates a [`WorldNodeRuntime`] with TS-default values: a fresh
/// [`NodeRuntime`] and a `None` (`null` in TS) `world_matrix` slot.
pub fn create_world_node_runtime() -> WorldNodeRuntime {
    WorldNodeRuntime {
        node: create_node_runtime(None),
        world_matrix: None,
    }
}

/// Returns a reference to the entity node's [`WorldNodeRuntime`], mirroring the
/// TS `getWorldNodeRuntime` accessor.
pub fn get_world_node_runtime(source: &WorldNodeEntity) -> &WorldNodeRuntime {
    &source.runtime
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entity() -> WorldNodeEntity {
        WorldNodeEntity {
            enabled: true,
            name: None,
            runtime: create_world_node_runtime(),
        }
    }

    // create_world_node_runtime

    #[test]
    fn create_world_node_runtime_initializes_transform_bookkeeping_ids() {
        let runtime = create_world_node_runtime();
        assert_eq!(runtime.node.local_transform_id, 0);
        assert_eq!(runtime.node.world_transform_id, 0);
        assert_eq!(runtime.node.world_transform_using_local_transform_id, -1);
        assert_eq!(runtime.node.world_transform_using_parent_transform_id, -1);
    }

    #[test]
    fn create_world_node_runtime_initializes_world_matrix_to_none() {
        let runtime = create_world_node_runtime();
        assert!(runtime.world_matrix.is_none());
    }

    // get_world_node_runtime

    #[test]
    fn get_world_node_runtime_returns_runtime_with_expected_initial_state() {
        let node = entity();
        let runtime = get_world_node_runtime(&node);
        assert!(runtime.node.children.is_none());
        assert!(runtime.node.parent.is_none());
        assert!(runtime.world_matrix.is_none());
    }
}
