use std::any::Any;
use std::sync::{Arc, RwLock};

use flight_entity::{Entity, EntityRuntimeSlot};
use flight_geometry::Rectangle;
use flight_node::contract::BoundsRectangleRuntimeMethods;
use flight_node::{
    AppearanceMut, AppearanceNode, AppearanceRef, BoundsNode, HasAppearance, HasAppearanceRuntime, HasBoundsRectangle,
    HasBoundsRectangleRuntime, Node, NodeFields, NodeRef, PartialNode, create_node,
    init_bounds_rectangle_runtime_trait,
};

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
    let options = PartialNode {
        enabled: Some(enabled),
        name: Some(name.to_string()),
    };
    let mut node: TestBoundsNode =
        create_node("SelectionBoundsTestNode".to_string(), Some(&options));
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
    let options = PartialNode {
        enabled: None,
        name: Some(name.to_string()),
    };
    let node: TestNode = create_node("SelectionTestNode".to_string(), Some(&options));
    return Arc::new(RwLock::new(node));
}

pub fn node_name(node: &NodeRef) -> String {
    return node.read().unwrap().node_fields().name.clone().unwrap();
}

pub fn same_node(a: &NodeRef, b: &NodeRef) -> bool {
    return Arc::ptr_eq(a, b);
}

pub fn same_nodes(a: &[NodeRef], b: &[NodeRef]) -> bool {
    return a.len() == b.len() && a.iter().zip(b).all(|(a, b)| Arc::ptr_eq(a, b));
}
