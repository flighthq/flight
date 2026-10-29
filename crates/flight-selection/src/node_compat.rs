//! flight-compiler: target-native

use std::sync::Arc;

use flight_node::NodeRef;

/// Node identity for selection membership: the same node allocation, never structural equality.
pub fn is_same_selection_node(a: &NodeRef, b: &NodeRef) -> bool {
    return Arc::ptr_eq(a, b);
}
