// flight-lint: allow-file(contract-vocabulary) D17 native glow ownership deliberately uses thread-bound host pointers and Result diagnostics outside the portable contract vocabulary
//! The host-token to thread-bound glow context seam (D17/D26).

use std::ffi::c_void;
use std::rc::Rc;
use std::sync::Arc;

use flight_host::GlContext as HostGlContext;

/// Send-safe provider payload placed inside the bottom-layer opaque `flight_host::GlContext`.
/// It contains no GL object. The loader is invoked only by `create_gl_context`, on the caller's GL
/// thread with the native context current, and the resulting `glow::Context` never crosses threads.
#[derive(Clone)]
pub struct GlContextToken {
    pub get_proc_address: Arc<dyn Fn(&str) -> *const c_void + Send + Sync>,
}

/// Narrows a host GL token and constructs the native glow context on the current GL thread.
///
/// # Safety
///
/// The provider must have made the context represented by `host` current on this thread. Every
/// non-null pointer returned by the token must have the ABI of the named GL entry point and remain
/// valid for the lifetime of the returned context.
// flight-lint: allow(conform-extra) D17 native host-token narrowing is the platform seam replacing browser WebGL context construction
pub unsafe fn create_gl_context(host: &HostGlContext) -> Result<Rc<glow::Context>, String> {
    let Some(token) = host.handle.as_ref().downcast_ref::<GlContextToken>() else {
        return Err(
            "createGlContext: host handle is not a flight-render-gl GlContextToken".to_string(),
        );
    };
    // SAFETY: this function's contract requires a current native context and an ABI-correct loader.
    let context =
        unsafe { glow::Context::from_loader_function(|name| (token.get_proc_address)(name)) };
    return Ok(Rc::new(context));
}
