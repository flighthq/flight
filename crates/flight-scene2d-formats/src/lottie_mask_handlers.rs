use std::sync::{Arc, LazyLock};

use crate::lottie_mask::lottie_additive_mask_handler;
use crate::lottie_registry::register_lottie_mask_handler;
use crate::types::*;

pub static LOTTIE_ALL_MASK_HANDLERS: LazyLock<Vec<LottieMaskHandler>> = LazyLock::new(|| {
    return vec![Arc::new(lottie_additive_mask_handler)];
});

pub fn register_lottie_mask_handlers(registry: &mut LottieRegistry) {
    register_lottie_mask_handler(
        registry,
        LOTTIE_MASK_KIND_ADDITIVE,
        LOTTIE_ALL_MASK_HANDLERS[0].clone(),
    );
}
