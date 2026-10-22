use std::sync::Arc;

use flight_host::HostImageSource;

use crate::types::*;

/// Resolves a bitmap readback from a host capability.
pub fn resolve_bitmap_readback(
    host_bitmap_readback: &HostBitmapReadbackCapability,
    source: &Arc<HostImageSource>,
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
    let outcome = (host_bitmap_readback.read_bitmap)(source, width, height, mode);
    return BitmapReadbackResolution {
        bitmap: outcome.bitmap,
        reason: match outcome.reason {
            BitmapReadbackBackendReason::NoCanvas => BitmapReadbackBlockReason::NoCanvas,
            BitmapReadbackBackendReason::Ok => BitmapReadbackBlockReason::Ok,
            BitmapReadbackBackendReason::TaintedSource => BitmapReadbackBlockReason::TaintedSource,
        },
    };
}
