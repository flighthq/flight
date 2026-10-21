//! Hierarchical appearance field group initialization (TS `hasAppearance.ts`).

use crate::types::*;

/// Options for `init_appearance_trait` (TS `Partial<HasAppearance>`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct HasAppearanceOptions {
    pub alpha: Option<f32>,
    pub visible: Option<bool>,
}

/// Resets the resolved-appearance cache tier (TS `initAppearanceRuntimeTrait`).
pub fn init_appearance_runtime_trait(target: &mut HasAppearanceRuntime) {
    target.world_alpha = None;
    target.world_alpha_using_appearance_id = -1;
    target.world_alpha_using_parent_appearance_id = -1;
    target.world_appearance_id = 0;
}

/// Applies the appearance defaults and any supplied options (TS `initAppearanceTrait`).
pub fn init_appearance_trait(target: &mut HasAppearance, obj: Option<&HasAppearanceOptions>) {
    target.alpha = obj.and_then(|obj| obj.alpha).unwrap_or(1.0);
    target.visible = obj.and_then(|obj| obj.visible).unwrap_or(true);
}
