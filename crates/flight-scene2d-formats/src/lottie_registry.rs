use crate::types::*;

pub fn create_lottie_registry() -> LottieRegistry {
    return LottieRegistry::default();
}

pub fn get_lottie_layer_handler(
    registry: &LottieRegistry,
    kind: LottieLayerKind,
) -> Option<LottieLayerHandler> {
    return registry
        .layer_handlers
        .iter()
        .find(|entry| entry.kind == kind)
        .map(|entry| entry.handle.clone());
}

pub fn get_lottie_mask_handler(registry: &LottieRegistry, kind: &str) -> Option<LottieMaskHandler> {
    return registry
        .mask_handlers
        .iter()
        .find(|entry| entry.kind == kind)
        .map(|entry| entry.handle.clone());
}

pub fn get_lottie_shape_item_handler(
    registry: &LottieRegistry,
    kind: &str,
) -> Option<LottieShapeItemHandler> {
    return registry
        .shape_item_handlers
        .iter()
        .find(|entry| entry.kind == kind)
        .map(|entry| entry.handle.clone());
}

pub fn register_lottie_layer_handler(
    registry: &mut LottieRegistry,
    kind: LottieLayerKind,
    handle: LottieLayerHandler,
) {
    if let Some(entry) = registry
        .layer_handlers
        .iter_mut()
        .find(|entry| entry.kind == kind)
    {
        entry.handle = handle;
        return;
    }
    registry
        .layer_handlers
        .push(LottieLayerHandlerEntry { handle, kind });
}

pub fn register_lottie_mask_handler(
    registry: &mut LottieRegistry,
    kind: &str,
    handle: LottieMaskHandler,
) {
    if let Some(entry) = registry
        .mask_handlers
        .iter_mut()
        .find(|entry| entry.kind == kind)
    {
        entry.handle = handle;
        return;
    }
    registry.mask_handlers.push(LottieMaskHandlerEntry {
        handle,
        kind: kind.to_string(),
    });
}

pub fn register_lottie_shape_item_handler(
    registry: &mut LottieRegistry,
    kind: &str,
    handle: LottieShapeItemHandler,
) {
    if let Some(entry) = registry
        .shape_item_handlers
        .iter_mut()
        .find(|entry| entry.kind == kind)
    {
        entry.handle = handle;
        return;
    }
    registry
        .shape_item_handlers
        .push(LottieShapeItemHandlerEntry {
            handle,
            kind: kind.to_string(),
        });
}

pub fn unregister_lottie_layer_handler(
    registry: &mut LottieRegistry,
    kind: LottieLayerKind,
) -> bool {
    let Some(index) = registry
        .layer_handlers
        .iter()
        .position(|entry| entry.kind == kind)
    else {
        return false;
    };
    registry.layer_handlers.remove(index);
    return true;
}

pub fn unregister_lottie_mask_handler(registry: &mut LottieRegistry, kind: &str) -> bool {
    let Some(index) = registry
        .mask_handlers
        .iter()
        .position(|entry| entry.kind == kind)
    else {
        return false;
    };
    registry.mask_handlers.remove(index);
    return true;
}

pub fn unregister_lottie_shape_item_handler(registry: &mut LottieRegistry, kind: &str) -> bool {
    let Some(index) = registry
        .shape_item_handlers
        .iter()
        .position(|entry| entry.kind == kind)
    else {
        return false;
    };
    registry.shape_item_handlers.remove(index);
    return true;
}
