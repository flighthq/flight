use std::any::Any;
use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{Entity, EntityRuntimeSlot};
use flight_geometry::Rectangle;
use flight_node::contract::BoundsRectangleRuntimeMethods;
use flight_node::{
    AppearanceMut, AppearanceNode, AppearanceRef, BoundsNode, HasAppearance, HasAppearanceRuntime,
    HasBoundsRectangle, HasBoundsRectangleRuntime, Node, NodeFields, NodeRef, create_node,
    init_bounds_rectangle_runtime_trait,
};
use flight_path::{Path, PathCommand, PathWinding};

#[derive(Default)]
struct TestNode {
    fields: NodeFields,
}

impl Entity for TestNode {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.fields.entity_runtime();
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.fields.entity_runtime_mut();
    }
}

impl Node for TestNode {
    fn node_fields(&self) -> &NodeFields {
        return &self.fields;
    }

    fn node_fields_mut(&mut self) -> &mut NodeFields {
        return &mut self.fields;
    }

    fn as_any(&self) -> &dyn Any {
        return self;
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        return self;
    }
}

#[derive(Default)]
struct TestBoundsNode {
    appearance: HasAppearance,
    appearance_runtime: HasAppearanceRuntime,
    _bounds: HasBoundsRectangle,
    bounds_runtime: HasBoundsRectangleRuntime,
    fields: NodeFields,
}

impl Entity for TestBoundsNode {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.fields.entity_runtime();
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.fields.entity_runtime_mut();
    }
}

impl Node for TestBoundsNode {
    fn node_fields(&self) -> &NodeFields {
        return &self.fields;
    }

    fn node_fields_mut(&mut self) -> &mut NodeFields {
        return &mut self.fields;
    }

    fn as_any(&self) -> &dyn Any {
        return self;
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        return self;
    }

    fn as_appearance_node(&self) -> Option<&dyn AppearanceNode> {
        return Some(self);
    }

    fn as_bounds_node(&self) -> Option<&dyn BoundsNode> {
        return Some(self);
    }

    fn as_bounds_node_mut(&mut self) -> Option<&mut dyn BoundsNode> {
        return Some(self);
    }
}

impl AppearanceNode for TestBoundsNode {
    fn appearance(&self) -> AppearanceRef<'_> {
        return self.appearance.as_ref();
    }

    fn appearance_mut(&mut self) -> AppearanceMut<'_> {
        return self.appearance.as_mut();
    }

    fn appearance_runtime(&self) -> &HasAppearanceRuntime {
        return &self.appearance_runtime;
    }

    fn appearance_runtime_mut(&mut self) -> &mut HasAppearanceRuntime {
        return &mut self.appearance_runtime;
    }
}

impl BoundsNode for TestBoundsNode {
    fn bounds_runtime(&self) -> &HasBoundsRectangleRuntime {
        return &self.bounds_runtime;
    }

    fn bounds_runtime_mut(&mut self) -> &mut HasBoundsRectangleRuntime {
        return &mut self.bounds_runtime;
    }
}

pub fn create_bounded_node(
    name: &str,
    rectangle: &Rectangle,
    enabled: bool,
    visible: bool,
) -> NodeRef {
    let mut node: TestBoundsNode = create_node("SelectionBoundsTestNode".to_string());
    node.node_fields_mut().enabled = enabled;
    node.node_fields_mut().name = Some(name.to_string());
    node.appearance.visible = visible;
    let x = rectangle.x;
    let y = rectangle.y;
    let width = rectangle.width;
    let height = rectangle.height;
    let methods = BoundsRectangleRuntimeMethods {
        compute_local_bounds_rectangle: Some(Arc::new(move |out, _source| {
            out.x = x;
            out.y = y;
            out.width = width;
            out.height = height;
        })),
        is_local_bounds_rectangle_valid: None,
    };
    init_bounds_rectangle_runtime_trait(&mut node.bounds_runtime, Some(&methods));
    return Arc::new(RwLock::new(node));
}

pub fn create_test_node(name: &str) -> NodeRef {
    let mut node: TestNode = create_node("SelectionTestNode".to_string());
    node.node_fields_mut().name = Some(name.to_string());
    return Arc::new(RwLock::new(node));
}

pub fn node_name(node: &NodeRef) -> String {
    return node.read().unwrap().node_fields().name.clone().unwrap();
}

pub fn joined_node_names(nodes: &[NodeRef]) -> String {
    return nodes.iter().map(node_name).collect::<Vec<_>>().join(",");
}

pub fn optional_node_name(node: &Option<NodeRef>) -> String {
    return node.as_ref().map(node_name).unwrap_or_default();
}

pub fn same_node(a: &NodeRef, b: &NodeRef) -> bool {
    return Arc::ptr_eq(a, b);
}

pub fn same_nodes(a: &[NodeRef], b: &[NodeRef]) -> bool {
    return a.len() == b.len() && a.iter().zip(b).all(|(a, b)| Arc::ptr_eq(a, b));
}

pub fn same_path(a: *const flight_path::Path, b: &flight_path::Path) -> bool {
    return std::ptr::eq(a, b as *const flight_path::Path);
}

pub fn has_even_odd_winding(path: &Path) -> bool {
    return path.winding == PathWinding::EvenOdd;
}

pub fn has_only_move_command(path: &Path) -> bool {
    return path.commands == [PathCommand::MOVE_TO as u8];
}

pub fn has_move_line_close_commands(path: &Path) -> bool {
    return path.commands
        == [
            PathCommand::MOVE_TO as u8,
            PathCommand::LINE_TO as u8,
            PathCommand::CLOSE as u8,
        ];
}

pub fn take_reentrant_flag(flag: &Mutex<bool>) -> bool {
    let mut flag = flag.lock().unwrap();
    if *flag {
        return false;
    }
    *flag = true;
    return true;
}

pub fn apply_pointer_policy(
    state: &flight_selection::SelectionState,
    hit: Option<&NodeRef>,
    modifiers: &flight_selection::SelectionModifierState,
) {
    flight_selection::apply_pointer_selection_policy(state, hit, modifiers);
}

pub fn same_rectangle(a: *const Rectangle, b: &Rectangle) -> bool {
    return std::ptr::eq(a, b as *const Rectangle);
}

pub fn contain_marquee_mode() -> flight_selection::MarqueeSelectionMode {
    return flight_selection::MarqueeSelectionMode::Contain;
}

// D24 out collectors: each call fills a fresh caller-owned Vec.
pub fn lasso_matches(
    selection: &flight_selection::LassoSelection,
    candidates: &[NodeRef],
) -> Vec<NodeRef> {
    let mut out = Vec::new();
    flight_selection::find_nodes_in_lasso_selection(&mut out, selection, candidates);
    return out;
}

pub fn marquee_matches(
    selection: &flight_selection::MarqueeSelection,
    candidates: &[NodeRef],
    mode: Option<flight_selection::MarqueeSelectionMode>,
) -> Vec<NodeRef> {
    let mut out = Vec::new();
    flight_selection::find_nodes_in_marquee_selection(&mut out, selection, candidates, mode);
    return out;
}

pub fn selected_nodes_of(state: &flight_selection::SelectionState) -> Vec<NodeRef> {
    let mut out = Vec::new();
    flight_selection::get_selected_nodes(&mut out, state);
    return out;
}
