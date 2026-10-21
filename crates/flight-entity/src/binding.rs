use std::any::Any;

use crate::runtime::ensure_entity_runtime;
use crate::types::Entity;

pub fn attach_entity_binding(entity: &mut Entity, binding: Box<dyn Any + Send + Sync>) {
    ensure_entity_runtime(entity).binding = Some(binding);
}

pub fn detach_entity_binding(entity: &mut Entity) {
    if let Some(runtime) = entity.runtime.data.as_mut() {
        runtime.binding = None;
    }
}

pub fn get_entity_binding(source: &Entity) -> Option<&(dyn Any + Send + Sync)> {
    return source.runtime.data.as_ref()?.binding.as_deref();
}

pub fn get_entity_binding_as<T: 'static>(source: &Entity) -> Option<&T> {
    return get_entity_binding(source)?.downcast_ref::<T>();
}

pub fn has_entity_binding(source: &Entity) -> bool {
    return get_entity_binding(source).is_some();
}
