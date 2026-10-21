//! Per-instance 2D compositing field group initialization (TS `hasBlendMode.ts`).

use crate::types::*;

/// Options for `init_blend_mode_trait` (TS `Partial<HasBlendMode>`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct HasBlendModeOptions {
    pub blend_mode: Option<flight_materials::BlendMode>,
}

/// Applies the blend-mode default and any supplied option (TS `initBlendModeTrait`).
pub fn init_blend_mode_trait(target: &mut HasBlendMode, obj: Option<&HasBlendModeOptions>) {
    target.blend_mode = obj.and_then(|obj| obj.blend_mode.clone());
}
