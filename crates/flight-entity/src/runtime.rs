use crate::types::{Entity, EntityRuntime};

pub fn create_entity_runtime() -> EntityRuntime {
    return EntityRuntime::default();
}

pub(crate) fn ensure_entity_runtime<T: Entity>(source: &mut T) -> &mut EntityRuntime {
    return source
        .entity_runtime_mut()
        .data
        .get_or_insert_with(|| Box::new(create_entity_runtime()));
}

pub fn get_entity_runtime<T: Entity>(source: &T) -> Option<&EntityRuntime> {
    return source.entity_runtime().data.as_deref();
}

/// Returns true when the entity's runtime slot has been allocated -- i.e. the entity has been
/// bound (attach_entity_binding) or otherwise given a runtime. A fresh or cloned entity has no
/// runtime and returns false.
pub fn has_entity_runtime<T: Entity>(source: &T) -> bool {
    return source.entity_runtime().data.is_some();
}
