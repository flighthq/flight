//! Flat, open 3D family declarations and their source-owned records.
// flight-lint: allow-file(contract-vocabulary, sugar-delegates) D16 family dispatch borrows actual flat fields and private runtime tiers, preserving the single Entity allocation
use flight_entity::{EntityRuntimeSlot, Float32Array, Ref};
use flight_geometry::{Quaternion, Vector3, create_quaternion, create_vector3};
use flight_node::{
    AppearanceNode, HasAppearanceRuntime, HasTransform3DRuntime, Node, NodeFields, NodeTraitsKey,
    Transform3DNode,
};
use std::ops::{Deref, DerefMut};
use std::sync::{Arc, LazyLock, RwLock, Weak};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use flight_entity::{get_entity_uid, set_entity_uid};
    use flight_node::NodeRef;

    #[test]
    fn publication_receiver_matches_free_bridge_and_preserves_original_identity() {
        let mut a: Node3DFields = crate::create_node3d(Some("Custom.Protocol".to_string()), None);
        let mut b: Node3DFields = crate::create_node3d(Some("Custom.Protocol".to_string()), None);
        set_entity_uid(&mut a, "method".to_string());
        set_entity_uid(&mut b, "free".to_string());
        a.position.x = 7.0;
        b.position.x = 7.0;
        let method = a.into_node3d_ref();
        let free = crate::publish_node3d(b);
        assert_eq!(
            method.read().unwrap().position.x,
            free.read().unwrap().position.x
        );
        assert_eq!(method.read().unwrap().kind, free.read().unwrap().kind);
        assert_eq!(get_entity_uid(&mut *method.write().unwrap()), "method");
        assert_eq!(get_entity_uid(&mut *free.write().unwrap()), "free");
        let method_node: NodeRef = method.clone();
        let free_node: NodeRef = free.clone();
        let method_family: Node3DRef = method;
        let free_family: Node3DRef = free;
        assert!(Arc::ptr_eq(
            &crate::as_node3d_ref(&method_node).unwrap(),
            &method_family
        ));
        assert!(Arc::ptr_eq(
            &crate::as_node3d_ref(&free_node).unwrap(),
            &free_family
        ));
    }
}

pub type Node3DRef = Ref<dyn Node3D>;
/// Principal68e645eb C1: non-owning recovery of the original published family handle.
pub type Node3DWeak = Weak<RwLock<dyn Node3D>>;
pub type Node3DVisitor = Arc<dyn Fn(&Node3DRef, usize) -> Option<bool> + Send + Sync>;

/// Source symbol identity is shared by every kind; the narrowing dispatch is per kind.
pub static NODE3D_TRAITS_KEY: LazyLock<Arc<NodeTraitsKey>> =
    LazyLock::new(|| Arc::new(NodeTraitsKey));

pub struct Node3DNarrow {
    pub as_node3d: fn(&dyn Node) -> Option<&dyn Node3D>,
    pub as_node3d_mut: fn(&mut dyn Node) -> Option<&mut dyn Node3D>,
    pub self_handle: Option<Node3DWeak>,
}

#[derive(Clone, Default)]
pub struct PartialNode3D {
    pub alpha: Option<f32>,
    pub enabled: Option<bool>,
    pub name: Option<String>,
    pub visible: Option<bool>,
}

pub struct Node3DFields {
    node: NodeFields,
    state: Node3DRuntime,
    pub alpha: f32,
    pub position: Vector3,
    pub rotation: Quaternion,
    pub scale: Vector3,
    pub visible: bool,
}

#[derive(Default)]
pub struct Node3DRuntime {
    pub appearance: HasAppearanceRuntime,
    pub transform3d: HasTransform3DRuntime,
}

pub trait Node3D: Node + Transform3DNode + AppearanceNode {
    /// Publish a fresh owned leaf through the same protocol as the built-in constructors.
    fn into_node3d_ref(self) -> Ref<Self>
    where
        Self: Sized,
    {
        return crate::publish_node3d(self);
    }
    fn node3d_fields(&self) -> &Node3DFields;
    fn node3d_fields_mut(&mut self) -> &mut Node3DFields;
    fn as_mesh(&self) -> Option<&crate::Mesh> {
        return None;
    }
    fn as_mesh_mut(&mut self) -> Option<&mut crate::Mesh> {
        return None;
    }
    fn as_instanced_mesh(&self) -> Option<&crate::InstancedMesh> {
        return None;
    }
    fn billboard_mode(&self) -> Option<crate::BillboardMode> {
        return None;
    }
}

/// The real skeleton Entity lives with the scene nodes it retains; skeleton3d owns its algorithms.
pub struct Skeleton3D {
    runtime: EntityRuntimeSlot,
    pub inverse_bind_matrices: Ref<Box<Float32Array>>,
    pub joint_matrices: Ref<Box<Float32Array>>,
    pub normal_matrices: Ref<Box<Float32Array>>,
    pub joints: Ref<Vec<Node3DRef>>,
    pub names: Option<Vec<String>>,
}

#[derive(Clone)]
pub struct Skin {
    pub skeleton: Ref<Skeleton3D>,
    pub skeleton_root: Option<Node3DRef>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Scene3DMetadata {
    pub copyright: Option<String>,
    pub generator: Option<String>,
    pub version: Option<String>,
}

#[macro_export]
macro_rules! impl_node3d {
    ($t:ty) => {
        $crate::impl_node3d!($t, custom_node3d);
        impl $crate::Node3D for $t {
            fn node3d_fields(&self) -> &$crate::Node3DFields {
                return &self.node;
            }
            fn node3d_fields_mut(&mut self) -> &mut $crate::Node3DFields {
                return &mut self.node;
            }
        }
        impl std::ops::Deref for $t {
            type Target = $crate::Node3DFields;
            fn deref(&self) -> &Self::Target {
                return &self.node;
            }
        }
        impl std::ops::DerefMut for $t {
            fn deref_mut(&mut self) -> &mut Self::Target {
                return &mut self.node;
            }
        }
    };
    ($t:ty, custom_node3d) => {
        impl flight_entity::Entity for $t {
            fn entity_runtime(&self) -> &flight_entity::EntityRuntimeSlot {
                return flight_entity::Entity::entity_runtime(&**$crate::Node3D::node3d_fields(
                    self,
                ));
            }
            fn entity_runtime_mut(&mut self) -> &mut flight_entity::EntityRuntimeSlot {
                return flight_entity::Entity::entity_runtime_mut(
                    &mut **$crate::Node3D::node3d_fields_mut(self),
                );
            }
        }
        impl flight_node::Node for $t {
            fn node_fields(&self) -> &flight_node::NodeFields {
                return $crate::Node3D::node3d_fields(self);
            }
            fn node_fields_mut(&mut self) -> &mut flight_node::NodeFields {
                return $crate::Node3D::node3d_fields_mut(self);
            }
            fn as_any(&self) -> &dyn std::any::Any {
                return self;
            }
            fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
                return self;
            }
            fn as_transform3d_node(&self) -> Option<&dyn flight_node::Transform3DNode> {
                return Some(self);
            }
            fn as_transform3d_node_mut(&mut self) -> Option<&mut dyn flight_node::Transform3DNode> {
                return Some(self);
            }
            fn as_appearance_node(&self) -> Option<&dyn flight_node::AppearanceNode> {
                return Some(self);
            }
        }
        impl flight_node::Transform3DNode for $t {
            fn transform3d(&self) -> flight_node::contract::Transform3DRef<'_> {
                let f = $crate::Node3D::node3d_fields(self);
                return flight_node::contract::Transform3DRef {
                    position: &f.position,
                    rotation: &f.rotation,
                    scale: &f.scale,
                };
            }
            fn transform3d_mut(&mut self) -> flight_node::contract::Transform3DMut<'_> {
                let f = $crate::Node3D::node3d_fields_mut(self);
                return flight_node::contract::Transform3DMut {
                    position: &mut f.position,
                    rotation: &mut f.rotation,
                    scale: &mut f.scale,
                };
            }
            fn transform3d_runtime(&self) -> &flight_node::HasTransform3DRuntime {
                return &$crate::Node3D::node3d_fields(self)
                    .node3d_runtime()
                    .transform3d;
            }
            fn transform3d_runtime_mut(&mut self) -> &mut flight_node::HasTransform3DRuntime {
                return &mut $crate::Node3D::node3d_fields_mut(self)
                    .node3d_runtime_mut()
                    .transform3d;
            }
        }
        impl flight_node::AppearanceNode for $t {
            fn appearance(&self) -> flight_node::AppearanceRef<'_> {
                let f = $crate::Node3D::node3d_fields(self);
                return flight_node::AppearanceRef {
                    alpha: &f.alpha,
                    visible: &f.visible,
                };
            }
            fn appearance_mut(&mut self) -> flight_node::AppearanceMut<'_> {
                let f = $crate::Node3D::node3d_fields_mut(self);
                return flight_node::AppearanceMut {
                    alpha: &mut f.alpha,
                    visible: &mut f.visible,
                };
            }
            fn appearance_runtime(&self) -> &flight_node::HasAppearanceRuntime {
                return &$crate::Node3D::node3d_fields(self)
                    .node3d_runtime()
                    .appearance;
            }
            fn appearance_runtime_mut(&mut self) -> &mut flight_node::HasAppearanceRuntime {
                return &mut $crate::Node3D::node3d_fields_mut(self)
                    .node3d_runtime_mut()
                    .appearance;
            }
        }
    };
}

impl Default for Node3DFields {
    fn default() -> Self {
        return Self {
            node: NodeFields::default(),
            state: Node3DRuntime::default(),
            alpha: 1.0,
            position: create_vector3(0.0, 0.0, 0.0),
            rotation: create_quaternion(0.0, 0.0, 0.0, 1.0),
            scale: create_vector3(1.0, 1.0, 1.0),
            visible: true,
        };
    }
}
impl Default for Skeleton3D {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            inverse_bind_matrices: Arc::new(RwLock::new(Box::new([]))),
            joint_matrices: Arc::new(RwLock::new(Box::new([]))),
            normal_matrices: Arc::new(RwLock::new(Box::new([]))),
            joints: Arc::new(RwLock::new(Vec::new())),
            names: None,
        };
    }
}
impl Deref for Node3DFields {
    type Target = NodeFields;
    fn deref(&self) -> &NodeFields {
        return &self.node;
    }
}
impl DerefMut for Node3DFields {
    fn deref_mut(&mut self) -> &mut NodeFields {
        return &mut self.node;
    }
}
impl Node3DFields {
    #[doc(hidden)]
    pub fn node3d_runtime(&self) -> &Node3DRuntime {
        return &self.state;
    }
    #[doc(hidden)]
    pub fn node3d_runtime_mut(&mut self) -> &mut Node3DRuntime {
        return &mut self.state;
    }
}
impl Node3D for Node3DFields {
    fn node3d_fields(&self) -> &Node3DFields {
        return self;
    }
    fn node3d_fields_mut(&mut self) -> &mut Node3DFields {
        return self;
    }
}
impl_node3d!(Node3DFields, custom_node3d);
flight_entity::impl_entity!(Skeleton3D);
