// flight-lint: allow-file(contract-vocabulary) D17/D26 Principal 1180c6be: the native payload of HostImageSource is a trait object mirroring the GPUCopyExternalImageSource use
//! External host-image upload (TS `wgpuExternalImageSource.ts`). Native wgpu has no
//! `copyExternalImageToTexture`, so a `HostImageSource` narrows to `Arc<dyn WgpuExternalImageSource>`
//! (D17 wgpu native narrowing): its size, readiness, and the copy. `NotReady` and `CopyFailed` are the
//! source's expected unavailability (`false`, retry later); every other error panics, as the source
//! rethrows.

use std::sync::Arc;

use flight_host::{HostImageSource, ProviderRef};

/// Why an external copy did not happen.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WgpuExternalCopyError {
    CopyFailed,
    Invalid(String),
    NotReady,
}

/// A host image a backend can copy into a GPU texture (TS `GPUCopyExternalImageSource`).
pub trait WgpuExternalImageSource: Send + Sync {
    fn copy_to_texture(
        &self,
        queue: &wgpu::Queue,
        texture: &wgpu::Texture,
        origin: wgpu::Origin3d,
        premultiplied_alpha: bool,
        width: u32,
        height: u32,
    ) -> Result<(), WgpuExternalCopyError>;
    fn height(&self) -> u32;
    fn is_ready(&self, width: u32, height: u32) -> bool;
    fn width(&self) -> u32;
}

/// Wraps an external image source as the host-vocabulary handle a host supplies.
// flight-lint: allow(conform-extra) D26/D17: the handle constructor for the approved external-image payload
pub fn create_wgpu_external_host_image_source(
    provider: ProviderRef,
    source: Arc<dyn WgpuExternalImageSource>,
) -> HostImageSource {
    return HostImageSource {
        provider,
        handle: Arc::new(source),
    };
}

/// Whether the source has current pixels covering `width`x`height` (TS
/// `isWgpuExternalImageSourceReady`): a positive extent and the source's own readiness.
pub fn is_wgpu_external_image_source_ready(
    source: &dyn WgpuExternalImageSource,
    width: u32,
    height: u32,
) -> bool {
    if width == 0 || height == 0 {
        return false;
    }
    return source.is_ready(width, height);
}

// The private narrowing of a host image to its external-copy payload. A foreign payload is a
// host-provider programming error (D10).
pub(crate) fn narrow_wgpu_external_image_source(
    source: &HostImageSource,
) -> Arc<dyn WgpuExternalImageSource> {
    return source
        .handle
        .downcast_ref::<Arc<dyn WgpuExternalImageSource>>()
        .expect("HostImageSource handle must carry an Arc<dyn flight_render_wgpu::WgpuExternalImageSource>")
        .clone();
}

/// Copies the source into `texture` (TS `tryCopyWgpuExternalImageToTexture`). `false` is expected
/// source unavailability, so the caller keeps its previous texture and retries; any other copy error
/// panics.
// flight-lint: allow(conform-params) D17: the native copy takes the queue, destination texture, origin and alpha encoding explicitly
pub fn try_copy_wgpu_external_image_to_texture(
    queue: &wgpu::Queue,
    source: &dyn WgpuExternalImageSource,
    texture: &wgpu::Texture,
    origin: wgpu::Origin3d,
    premultiplied_alpha: bool,
    width: u32,
    height: u32,
) -> bool {
    if !is_wgpu_external_image_source_ready(source, width, height) {
        return false;
    }
    return match source.copy_to_texture(queue, texture, origin, premultiplied_alpha, width, height)
    {
        Ok(()) => true,
        Err(WgpuExternalCopyError::CopyFailed | WgpuExternalCopyError::NotReady) => false,
        Err(WgpuExternalCopyError::Invalid(message)) => panic!("{message}"),
    };
}
