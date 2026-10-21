use crate::types::*;

pub fn create_spine_json_registry() -> SpineJsonRegistry {
    return SpineJsonRegistry::default();
}

pub fn get_spine_json_section_handler(
    registry: &SpineJsonRegistry,
    kind: &str,
) -> Option<SpineJsonSectionHandler> {
    return registry
        .section_handlers
        .iter()
        .find(|entry| entry.kind == kind)
        .map(|entry| entry.handle.clone());
}

pub fn get_spine_json_timeline_handler(
    registry: &SpineJsonRegistry,
    kind: &str,
) -> Option<SpineJsonTimelineHandler> {
    return registry
        .timeline_handlers
        .iter()
        .find(|entry| entry.kind == kind)
        .map(|entry| entry.handle.clone());
}

pub fn register_spine_json_section_handler(
    registry: &mut SpineJsonRegistry,
    kind: &str,
    handle: SpineJsonSectionHandler,
) {
    if let Some(entry) = registry
        .section_handlers
        .iter_mut()
        .find(|entry| entry.kind == kind)
    {
        entry.handle = handle;
        return;
    }
    registry
        .section_handlers
        .push(SpineJsonSectionHandlerEntry {
            handle,
            kind: kind.to_string(),
        });
}

pub fn register_spine_json_timeline_handler(
    registry: &mut SpineJsonRegistry,
    kind: &str,
    handle: SpineJsonTimelineHandler,
) {
    if let Some(entry) = registry
        .timeline_handlers
        .iter_mut()
        .find(|entry| entry.kind == kind)
    {
        entry.handle = handle;
        return;
    }
    registry
        .timeline_handlers
        .push(SpineJsonTimelineHandlerEntry {
            handle,
            kind: kind.to_string(),
        });
}

pub fn unregister_spine_json_section_handler(registry: &mut SpineJsonRegistry, kind: &str) -> bool {
    let Some(index) = registry
        .section_handlers
        .iter()
        .position(|entry| entry.kind == kind)
    else {
        return false;
    };
    registry.section_handlers.remove(index);
    return true;
}

pub fn unregister_spine_json_timeline_handler(
    registry: &mut SpineJsonRegistry,
    kind: &str,
) -> bool {
    let Some(index) = registry
        .timeline_handlers
        .iter()
        .position(|entry| entry.kind == kind)
    else {
        return false;
    };
    registry.timeline_handlers.remove(index);
    return true;
}
