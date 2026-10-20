use std::any::Any;

use crate::runtime::create_entity_runtime;
use crate::types::Entity;

pub fn attach_entity_binding(entity: &mut Entity, binding: Box<dyn Any>) {
    if entity.runtime.is_none() {
        entity.runtime = Some(create_entity_runtime());
    }
    entity.runtime.as_mut().unwrap().binding = Some(binding);
}

pub fn detach_entity_binding(entity: &mut Entity) {
    if let Some(runtime) = entity.runtime.as_mut() {
        runtime.binding = None;
    }
}

pub fn get_entity_binding(source: &Entity) -> Option<&dyn Any> {
    return source.runtime.as_ref()?.binding.as_deref();
}

pub fn get_entity_binding_as<T: 'static>(source: &Entity) -> Option<&T> {
    return get_entity_binding(source)?.downcast_ref::<T>();
}

pub fn has_entity_binding(source: &Entity) -> bool {
    return get_entity_binding(source).is_some();
}
