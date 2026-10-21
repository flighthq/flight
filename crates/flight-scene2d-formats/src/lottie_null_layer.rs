use crate::types::LottieLayerContext;

/// Handles a Lottie null layer. The document walk has already applied the layer's transform,
/// visibility window, and parenting, so the null layer contributes no content of its own.
pub fn lottie_null_layer_handler(_context: &mut LottieLayerContext<'_, '_>) {}
