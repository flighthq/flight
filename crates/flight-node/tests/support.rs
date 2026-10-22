use std::any::Any;
use std::sync::{Arc, RwLock};

use flight_entity::{Entity, EntityRuntimeSlot};
use flight_node::contract::*;

/// A bare node kind: only the common fields.
#[derive(Default)]
pub struct TestNode {
    pub fields: NodeFields,
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

/// A node kind carrying the 2D feature groups used by transforms and bounds work.
#[derive(Default)]
pub struct TestNode2D {
    pub fields: NodeFields,
    pub appearance: HasAppearance,
    pub appearance_runtime: HasAppearanceRuntime,
    pub _blend_mode: HasBlendMode,
    pub transform2d: HasTransform2D,
    pub transform2d_runtime: HasTransform2DRuntime,
    pub _bounds: HasBoundsRectangle,
    pub bounds_runtime: HasBoundsRectangleRuntime,
}

impl Entity for TestNode2D {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.fields.entity_runtime();
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.fields.entity_runtime_mut();
    }
}

impl Node for TestNode2D {
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

    fn as_transform2d_node(&self) -> Option<&dyn Transform2DNode> {
        return Some(self);
    }

    fn as_transform2d_node_mut(&mut self) -> Option<&mut dyn Transform2DNode> {
        return Some(self);
    }

    fn as_bounds_node(&self) -> Option<&dyn BoundsNode> {
        return Some(self);
    }

    fn as_bounds_node_mut(&mut self) -> Option<&mut dyn BoundsNode> {
        return Some(self);
    }

    fn as_appearance_node(&self) -> Option<&dyn AppearanceNode> {
        return Some(self);
    }
}

impl Transform2DNode for TestNode2D {
    fn transform2d(&self) -> Transform2DRef<'_> {
        return self.transform2d.as_ref();
    }

    fn transform2d_mut(&mut self) -> Transform2DMut<'_> {
        return self.transform2d.as_mut();
    }

    fn transform2d_runtime(&self) -> &HasTransform2DRuntime {
        return &self.transform2d_runtime;
    }

    fn transform2d_runtime_mut(&mut self) -> &mut HasTransform2DRuntime {
        return &mut self.transform2d_runtime;
    }
}

impl BoundsNode for TestNode2D {
    fn bounds_runtime(&self) -> &HasBoundsRectangleRuntime {
        return &self.bounds_runtime;
    }

    fn bounds_runtime_mut(&mut self) -> &mut HasBoundsRectangleRuntime {
        return &mut self.bounds_runtime;
    }
}

impl AppearanceNode for TestNode2D {
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

/// A node kind carrying the 3D transform feature group.
#[derive(Default)]
pub struct TestNode3D {
    pub fields: NodeFields,
    pub transform3d: HasTransform3D,
    pub transform3d_runtime: HasTransform3DRuntime,
}

impl Entity for TestNode3D {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.fields.entity_runtime();
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.fields.entity_runtime_mut();
    }
}

impl Node for TestNode3D {
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

    fn as_transform3d_node(&self) -> Option<&dyn Transform3DNode> {
        return Some(self);
    }

    fn as_transform3d_node_mut(&mut self) -> Option<&mut dyn Transform3DNode> {
        return Some(self);
    }
}

impl Transform3DNode for TestNode3D {
    fn transform3d(&self) -> Transform3DRef<'_> {
        return self.transform3d.as_ref();
    }

    fn transform3d_mut(&mut self) -> Transform3DMut<'_> {
        return self.transform3d.as_mut();
    }

    fn transform3d_runtime(&self) -> &HasTransform3DRuntime {
        return &self.transform3d_runtime;
    }

    fn transform3d_runtime_mut(&mut self) -> &mut HasTransform3DRuntime {
        return &mut self.transform3d_runtime;
    }
}

pub fn create_test_node(kind: &str) -> NodeRef {
    let node: TestNode = create_node(String::from(kind));
    let out: NodeRef = Arc::new(RwLock::new(node));
    return out;
}

pub fn create_test_node_2d(kind: &str) -> NodeRef {
    let node: TestNode2D = create_node(String::from(kind));
    let out: NodeRef = Arc::new(RwLock::new(node));
    return out;
}

pub fn create_test_node_3d(kind: &str) -> NodeRef {
    let node: TestNode3D = create_node(String::from(kind));
    let out: NodeRef = Arc::new(RwLock::new(node));
    return out;
}
