use crate::types::*;

pub fn create_spine_binary_registry() -> SpineBinaryRegistry {
    return SpineBinaryRegistry::default();
}

pub fn get_spine_binary_section_handler(
    registry: &SpineBinaryRegistry,
    kind: &str,
) -> Option<SpineBinarySectionHandler> {
    return registry
        .section_handlers
        .iter()
        .find(|entry| entry.kind == kind)
        .map(|entry| entry.handle.clone());
}

pub fn get_spine_binary_timeline_handler(
    registry: &SpineBinaryRegistry,
    kind: &str,
) -> Option<SpineBinaryTimelineHandler> {
    return registry
        .timeline_handlers
        .iter()
        .find(|entry| entry.kind == kind)
        .map(|entry| entry.handle.clone());
}

pub fn register_spine_binary_section_handler(
    registry: &mut SpineBinaryRegistry,
    kind: &str,
    handle: SpineBinarySectionHandler,
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
        .push(SpineBinarySectionHandlerEntry {
            handle,
            kind: kind.to_string(),
        });
}

pub fn register_spine_binary_timeline_handler(
    registry: &mut SpineBinaryRegistry,
    kind: &str,
    handle: SpineBinaryTimelineHandler,
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
        .push(SpineBinaryTimelineHandlerEntry {
            handle,
            kind: kind.to_string(),
        });
}

pub fn unregister_spine_binary_section_handler(
    registry: &mut SpineBinaryRegistry,
    kind: &str,
) -> bool {
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

pub fn unregister_spine_binary_timeline_handler(
    registry: &mut SpineBinaryRegistry,
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
