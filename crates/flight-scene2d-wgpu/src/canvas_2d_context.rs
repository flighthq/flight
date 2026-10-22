// flight-lint: allow-file(contract-vocabulary) D17/D26 the handle constructor takes the Rust trait-object form of the TS CanvasRenderingContext2D
//! The D17 narrowing of the host's opaque Canvas 2D context handle (TS `CanvasRenderingContext2D`):
//! a native 2D provider wraps its drawing members (`Canvas2DContext`) in the handle it supplies.

use std::sync::Arc;

use flight_host::{CanvasRenderingContext2D, ProviderRef};

use crate::types::*;

/// Wraps a 2D drawing context as the host-vocabulary handle a host supplies, keeping the context's
/// `Arc` identity as the platform identity.
// flight-lint: allow(conform-extra) D26/D17: the handle constructor for the Canvas 2D narrowing payload, mirroring create_wgpu_surface_context
pub fn create_canvas_2d_context_handle(
    provider: ProviderRef,
    context: Arc<dyn Canvas2DContext>,
) -> CanvasRenderingContext2D {
    return CanvasRenderingContext2D {
        provider,
        handle: Arc::new(context),
    };
}
