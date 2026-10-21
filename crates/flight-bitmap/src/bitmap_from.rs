use crate::bitmap_readback_resolver::resolve_bitmap_readback;
use crate::types::*;

/// Creates a bitmap from a host image source.
pub fn create_bitmap_from_image_source(
    host_bitmap_readback: &HostBitmapReadbackCapability,
    source: &HostImageSource,
    width: u32,
    height: u32,
) -> Option<Bitmap> {
    resolve_bitmap_readback(host_bitmap_readback, source, width, height, BitmapReadbackMode::Bitmap).bitmap
}

/// Captures a bitmap from an image resource via the host readback capability.
pub fn capture_bitmap_from_image_resource(
    host_bitmap_readback: &HostBitmapReadbackCapability,
    resource: &ImageResource,
) -> Option<Bitmap> {
    create_bitmap_from_image_source(host_bitmap_readback, &resource.source, resource.width, resource.height)
}
