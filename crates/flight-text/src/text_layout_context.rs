use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_textlayout::contract::create_text_layout_measure_state;
use flight_textshaper::HostTextShaperCapability;

use crate::types::TextLayoutContext;

// flight-lint: allow(conform-extra) D5 caller-owned context replaces the source package's measure and guard globals
pub fn create_text_layout_context(
    host_text_shaper: Option<HostTextShaperCapability>,
) -> Ref<TextLayoutContext> {
    return Arc::new(RwLock::new(TextLayoutContext {
        guard: None,
        host_text_shaper,
        measure_state: create_text_layout_measure_state(),
    }));
}
