use flight_entity::{Entity, EntityRuntimeSlot};
use flight_node::{
    HasTransform3D, HasTransform3DRuntime, Node, NodeFields, NodeRef, Transform3DNode, create_node,
    init_transform3d_trait,
};
use std::any::Any;
use std::sync::{Arc, RwLock};

#[derive(Default)]
pub struct TransformFeatureFixture {
    fields: NodeFields,
    transform: HasTransform3D,
    transform_runtime: HasTransform3DRuntime,
}

impl Entity for TransformFeatureFixture {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.fields.entity_runtime();
    }
    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.fields.entity_runtime_mut();
    }
}

impl Node for TransformFeatureFixture {
    fn node_fields(&self) -> &NodeFields {
        return &self.fields;
    }
    fn node_fields_mut(&mut self) -> &mut NodeFields {
        return &mut self.fields;
    }
    fn as_any(&self) -> &dyn Any {
        return self;
    }
    fn as_transform3d_node(&self) -> Option<&dyn Transform3DNode> {
        return Some(self);
    }
    fn as_transform3d_node_mut(&mut self) -> Option<&mut dyn Transform3DNode> {
        return Some(self);
    }
}

impl Transform3DNode for TransformFeatureFixture {
    fn transform3d(&self) -> &HasTransform3D {
        return &self.transform;
    }
    fn transform3d_mut(&mut self) -> &mut HasTransform3D {
        return &mut self.transform;
    }
    fn transform3d_runtime(&self) -> &HasTransform3DRuntime {
        return &self.transform_runtime;
    }
    fn transform3d_runtime_mut(&mut self) -> &mut HasTransform3DRuntime {
        return &mut self.transform_runtime;
    }
}

pub fn transform_feature_fixture() -> NodeRef {
    let mut node: TransformFeatureFixture =
        create_node("TransformFeatureFixture".to_string(), None);
    init_transform3d_trait(&mut node.transform, None);
    return Arc::new(RwLock::new(node));
}
