use crate::types::*;

pub fn create_dragon_bones_registry() -> DragonBonesRegistry {
    return DragonBonesRegistry::default();
}

pub fn get_dragon_bones_section_handler(
    registry: &DragonBonesRegistry,
    kind: &str,
) -> Option<DragonBonesSectionHandler> {
    return registry
        .section_handlers
        .iter()
        .find(|entry| entry.kind == kind)
        .map(|entry| entry.handle.clone());
}

pub fn get_dragon_bones_timeline_handler(
    registry: &DragonBonesRegistry,
    kind: &str,
) -> Option<DragonBonesTimelineHandler> {
    return registry
        .timeline_handlers
        .iter()
        .find(|entry| entry.kind == kind)
        .map(|entry| entry.handle.clone());
}

pub fn register_dragon_bones_section_handler(
    registry: &mut DragonBonesRegistry,
    kind: &str,
    handle: DragonBonesSectionHandler,
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
        .push(DragonBonesSectionHandlerEntry {
            handle,
            kind: kind.to_string(),
        });
}

pub fn register_dragon_bones_timeline_handler(
    registry: &mut DragonBonesRegistry,
    kind: &str,
    handle: DragonBonesTimelineHandler,
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
        .push(DragonBonesTimelineHandlerEntry {
            handle,
            kind: kind.to_string(),
        });
}

pub fn unregister_dragon_bones_section_handler(
    registry: &mut DragonBonesRegistry,
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

pub fn unregister_dragon_bones_timeline_handler(
    registry: &mut DragonBonesRegistry,
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
