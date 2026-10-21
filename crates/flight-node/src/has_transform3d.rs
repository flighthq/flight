//! 3D local transform field group initialization (TS `hasTransform3d.ts`).

use flight_geometry::{clone_quaternion, clone_vector3, create_quaternion, create_vector3};

use crate::types::*;

/// Options for `init_transform3d_trait` (TS `Partial<HasTransform3D>`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct HasTransform3DOptions {
    pub position: Option<flight_geometry::Vector3>,
    pub rotation: Option<flight_geometry::Quaternion>,
    pub scale: Option<flight_geometry::Vector3>,
}

/// Resets the 3D matrix caches (TS `initTransform3DRuntimeTrait`).
pub fn init_transform3d_runtime_trait(target: &mut HasTransform3DRuntime) {
    target.local_matrix4 = None;
    target.local_matrix4_detached = false;
    target.world_matrix4 = None;
}

/// Applies the 3D transform defaults, copying supplied values (TS `initTransform3DTrait`).
pub fn init_transform3d_trait(target: &mut HasTransform3D, obj: Option<&HasTransform3DOptions>) {
    target.position = obj
        .and_then(|obj| obj.position.as_ref())
        .map(clone_vector3)
        .unwrap_or_else(|| create_vector3(0.0, 0.0, 0.0));
    target.rotation = obj
        .and_then(|obj| obj.rotation.as_ref())
        .map(clone_quaternion)
        .unwrap_or_else(|| create_quaternion(0.0, 0.0, 0.0, 1.0));
    target.scale = obj
        .and_then(|obj| obj.scale.as_ref())
        .map(clone_vector3)
        .unwrap_or_else(|| create_vector3(1.0, 1.0, 1.0));
}
