//! Anti-aliasing effect constructors.
//!
//! Each function builds the corresponding plain-data descriptor; per-backend
//! recipes register runners against the [`RenderEffect`] variant and dispatch
//! the intent through the pipeline.
//!
//! [`RenderEffect`]: crate::types::RenderEffect

use crate::types::{FxaaEffect, SmaaEffect, TaaEffect};

/// Returns a new [`FxaaEffect`] with the given options.
pub fn create_fxaa_effect(options: FxaaEffect) -> FxaaEffect {
    options
}

/// Returns a new [`SmaaEffect`] with the given options.
pub fn create_smaa_effect(options: SmaaEffect) -> SmaaEffect {
    options
}

/// Returns a new [`TaaEffect`] with the given options.
pub fn create_taa_effect(options: TaaEffect) -> TaaEffect {
    options
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_fxaa_effect_returns_descriptor() {
        let effect = create_fxaa_effect(FxaaEffect {
            edge_threshold: Some(0.05),
            subpixel: Some(0.75),
        });
        assert_eq!(effect.edge_threshold, Some(0.05));
        assert_eq!(effect.subpixel, Some(0.75));
    }

    #[test]
    fn create_smaa_effect_returns_descriptor() {
        let effect = create_smaa_effect(SmaaEffect {
            threshold: Some(0.1),
        });
        assert_eq!(effect.threshold, Some(0.1));
    }

    #[test]
    fn create_taa_effect_returns_descriptor() {
        let effect = create_taa_effect(TaaEffect {
            feedback: Some(0.9),
        });
        assert_eq!(effect.feedback, Some(0.9));
    }
}
