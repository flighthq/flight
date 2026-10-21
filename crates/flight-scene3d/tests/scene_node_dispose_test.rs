use crate::support::*;
use flight_node::{add_node_child, get_node_child_count, get_node_parent};
use flight_scene3d::contract::*;
mod dispose_node3d {
    use super::*;
    #[test]
    fn clears_signals_and_detaches_from_parent() {
        let p = as_node_ref(&node3d());
        let n = as_node_ref(&node3d());
        add_node_child(&p, &n);
        enable_node3d_signals(&n);
        dispose_node3d(&n);
        assert!(n.read().unwrap().node_runtime().node_signals.is_none());
        assert!(get_node_parent(&n).is_none());
        assert_eq!(get_node_child_count(&p), 0);
        dispose_node3d(&as_node_ref(&node3d()));
    }
    #[test]
    fn recursively_disposes_every_descendant() {
        let root = as_node_ref(&node3d());
        let child = as_node_ref(&node3d());
        let grandchild = as_node_ref(&node3d());
        add_node_child(&root, &child);
        add_node_child(&child, &grandchild);
        dispose_node3d(&root);
        assert!(get_node_parent(&grandchild).is_none());
        assert_eq!(get_node_child_count(&child), 0);
        assert_eq!(get_node_child_count(&root), 0);
    }
}
