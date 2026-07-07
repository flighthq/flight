//! Teardown for scene nodes.
//!
//! Ports the TS `@flighthq/scene` `sceneNodeDispose.ts`. `dispose_scene_node`
//! detaches the node from its parent, severs every parent-child link within its
//! subtree, and clears each node's signal registry — the `dispose_*` contract
//! (detach and release to GC). It frees no GPU or native resources; those are
//! `destroy_*` concerns owned by the render crates.

use flighthq_node::{HierarchyArena, NodeId, detach_node, get_node_children, remove_node_children};

use crate::scene_node::SceneArena;

/// Detaches `node` from its parent (if any), recursively unlinks all descendants,
/// and clears each node's signal registry so the subtree becomes eligible for
/// garbage collection. Nodes remain present in the arenas (inert) after disposal;
/// disposing a standalone leaf is a no-op beyond clearing its signals.
pub fn dispose_scene_node(arena: &mut SceneArena, hierarchy: &mut HierarchyArena, node: NodeId) {
    detach_node(hierarchy, node);

    // Collect the whole subtree while the child links are still intact, then
    // sever and clear each node.
    let mut subtree = Vec::new();
    collect_subtree(hierarchy, node, &mut subtree);
    for n in subtree {
        remove_node_children(hierarchy, n, 0, None);
        arena[n].signals = None;
    }
}

fn collect_subtree(hierarchy: &HierarchyArena, node: NodeId, out: &mut Vec<NodeId>) {
    out.push(node);
    for child in get_node_children(hierarchy, node) {
        collect_subtree(hierarchy, child, out);
    }
}

#[cfg(test)]
mod tests {
    use flighthq_node::{HierarchyNode, add_node_child, get_node_children, get_node_parent};

    use super::*;
    use crate::scene_node::{
        SceneArena, create_scene_node, enable_scene_node_signals, get_scene_node_signals,
    };

    fn add_pair(scene: &mut SceneArena, hierarchy: &mut HierarchyArena) -> NodeId {
        let s = create_scene_node(scene, None);
        let h = hierarchy.insert(HierarchyNode::default());
        assert_eq!(s, h);
        s
    }

    // dispose_scene_node

    #[test]
    fn clears_signals_after_disposal() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let node = add_pair(&mut scene, &mut hierarchy);
        enable_scene_node_signals(&mut scene, node);
        dispose_scene_node(&mut scene, &mut hierarchy, node);
        assert!(get_scene_node_signals(&scene, node).is_none());
    }

    #[test]
    fn detaches_the_node_from_its_parent() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let parent = add_pair(&mut scene, &mut hierarchy);
        let child = add_pair(&mut scene, &mut hierarchy);
        add_node_child(&mut hierarchy, parent, child);
        dispose_scene_node(&mut scene, &mut hierarchy, child);
        assert!(get_node_parent(&hierarchy, child).is_none());
        assert!(get_node_children(&hierarchy, parent).is_empty());
    }

    #[test]
    fn disposes_a_standalone_leaf_without_panicking() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let leaf = add_pair(&mut scene, &mut hierarchy);
        dispose_scene_node(&mut scene, &mut hierarchy, leaf);
    }

    #[test]
    fn recursively_disposes_all_descendants() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let root = add_pair(&mut scene, &mut hierarchy);
        let child = add_pair(&mut scene, &mut hierarchy);
        let grandchild = add_pair(&mut scene, &mut hierarchy);
        add_node_child(&mut hierarchy, root, child);
        add_node_child(&mut hierarchy, child, grandchild);
        dispose_scene_node(&mut scene, &mut hierarchy, root);
        assert!(get_node_parent(&hierarchy, grandchild).is_none());
        assert!(get_node_children(&hierarchy, child).is_empty());
    }
}
