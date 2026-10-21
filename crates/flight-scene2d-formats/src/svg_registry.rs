use crate::types::*;

pub fn create_svg_registry() -> SvgRegistry {
    return SvgRegistry::default();
}

pub fn get_svg_clip_handler(registry: &SvgRegistry, kind: &str) -> Option<SvgClipHandler> {
    return registry
        .clip_handlers
        .iter()
        .find(|entry| entry.kind == kind)
        .map(|entry| entry.handle.clone());
}

pub fn get_svg_element_handler(registry: &SvgRegistry, kind: &str) -> Option<SvgElementHandler> {
    return registry
        .element_handlers
        .iter()
        .find(|entry| entry.kind == kind)
        .map(|entry| entry.handle.clone());
}

pub fn register_svg_clip_handler(registry: &mut SvgRegistry, kind: &str, handle: SvgClipHandler) {
    if let Some(entry) = registry
        .clip_handlers
        .iter_mut()
        .find(|entry| entry.kind == kind)
    {
        entry.handle = handle;
        return;
    }
    registry.clip_handlers.push(SvgClipHandlerEntry {
        handle,
        kind: kind.to_string(),
    });
}

pub fn register_svg_element_handler(
    registry: &mut SvgRegistry,
    kind: &str,
    handle: SvgElementHandler,
) {
    if let Some(entry) = registry
        .element_handlers
        .iter_mut()
        .find(|entry| entry.kind == kind)
    {
        entry.handle = handle;
        return;
    }
    registry.element_handlers.push(SvgElementHandlerEntry {
        handle,
        kind: kind.to_string(),
    });
}

pub fn unregister_svg_clip_handler(registry: &mut SvgRegistry, kind: &str) -> bool {
    let Some(index) = registry
        .clip_handlers
        .iter()
        .position(|entry| entry.kind == kind)
    else {
        return false;
    };
    registry.clip_handlers.remove(index);
    return true;
}

pub fn unregister_svg_element_handler(registry: &mut SvgRegistry, kind: &str) -> bool {
    let Some(index) = registry
        .element_handlers
        .iter()
        .position(|entry| entry.kind == kind)
    else {
        return false;
    };
    registry.element_handlers.remove(index);
    return true;
}
