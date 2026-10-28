//! flight-compiler: target-native

use std::any::Any;

use crate::runtime::ensure_entity_runtime;
use crate::types::Entity;

pub fn attach_entity_binding<T: Entity>(entity: &mut T, binding: Box<dyn Any + Send + Sync>) {
    ensure_entity_runtime(entity).binding = Some(binding);
}

pub fn detach_entity_binding<T: Entity>(entity: &mut T) {
    if let Some(runtime) = entity.entity_runtime_mut().data.as_mut() {
        runtime.binding = None;
    }
}

pub fn get_entity_binding<T: Entity>(source: &T) -> Option<&(dyn Any + Send + Sync)> {
    return source.entity_runtime().data.as_ref()?.binding.as_deref();
}

pub fn get_entity_binding_as<B: 'static, T: Entity>(source: &T) -> Option<&B> {
    return get_entity_binding(source)?.downcast_ref::<B>();
}

pub fn has_entity_binding<T: Entity>(source: &T) -> bool {
    return get_entity_binding(source).is_some();
}
