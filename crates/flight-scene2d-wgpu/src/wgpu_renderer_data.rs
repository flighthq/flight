// flight-lint: allow-file(contract-vocabulary) D16 renderer-private scratch is generic over the open RendererData family, erased behind the RendererData trait object
//! Renderer-private scratch as `RendererData` (TS `wgpuRendererData.ts`). In Rust a scratch record
//! composes `RendererDataFields` and implements the trait (`flight_node::impl_renderer_data!`), so
//! the source's runtime-slot stamp is the composed field and the cast back is a downcast.

use std::sync::{Arc, RwLock};

use flight_node::{RendererData, RendererDataRef};

/// Erases renderer-private state into a `RendererData` handle (TS `createWgpuRendererData`).
pub fn create_wgpu_renderer_data<T: RendererData>(data: T) -> RendererDataRef {
    return Arc::new(RwLock::new(data));
}

/// Writes `data` into a preallocated scratch record, keeping the receiver's entity identity (TS
/// `initializeWgpuRendererData`).
pub fn initialize_wgpu_renderer_data<T: RendererData>(out: &mut T, data: T) {
    let runtime = std::mem::take(&mut out.renderer_data_fields_mut().runtime);
    *out = data;
    out.renderer_data_fields_mut().runtime = runtime;
}

/// Narrows `RendererData` back to `T` for reading inside `submit`/`destroy_data` (TS
/// `getWgpuRendererData`); `None` when absent or of another kind.
pub fn get_wgpu_renderer_data<T: RendererData>(data: Option<&dyn RendererData>) -> Option<&T> {
    return data?.as_any().downcast_ref::<T>();
}

/// The mutable twin of `get_wgpu_renderer_data`.
// flight-lint: allow(conform-extra) the mutable twin of the source getWgpuRendererData cast: Rust separates shared and exclusive borrows
pub fn get_wgpu_renderer_data_mut<T: RendererData>(
    data: Option<&mut dyn RendererData>,
) -> Option<&mut T> {
    return data?.as_any_mut().downcast_mut::<T>();
}
