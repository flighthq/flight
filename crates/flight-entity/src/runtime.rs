use crate::types::{Entity, EntityRuntimeData};

pub fn create_entity_runtime() -> EntityRuntimeData {
    return EntityRuntimeData::default();
}

pub(crate) fn ensure_entity_runtime(source: &mut Entity) -> &mut EntityRuntimeData {
    return source.runtime.data.get_or_insert_with(|| Box::new(create_entity_runtime()));
}

pub fn get_entity_runtime(source: &Entity) -> Option<&EntityRuntimeData> {
    return source.runtime.data.as_deref();
}

/// Returns true when the entity's runtime slot has been allocated -- i.e. the entity has been
/// bound (attach_entity_binding) or otherwise given a runtime. A fresh or cloned entity has no
/// runtime and returns false.
pub fn has_entity_runtime(source: &Entity) -> bool {
    return source.runtime.data.is_some();
}
