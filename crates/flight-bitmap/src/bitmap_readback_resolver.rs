use crate::types::*;

/// Resolves a bitmap readback from a host capability.
pub fn resolve_bitmap_readback(
    host: &HostBitmapReadbackCapability,
    source: &HostImageSource,
    width: u32,
    height: u32,
    mode: BitmapReadbackMode,
) -> BitmapReadbackResolution {
    if width == 0 || height == 0 {
        return BitmapReadbackResolution {
            bitmap: None,
            reason: BitmapReadbackBlockReason::EmptySize,
        };
    }
    (host.read_bitmap)(source, width, height, mode)
}
