use crate::bitmap_readback_resolver::resolve_bitmap_readback;
use crate::types::*;

/// Probes whether a bitmap readback would succeed.
pub fn explain_bitmap_readback(
    host: &HostBitmapReadbackCapability,
    source: &HostImageSource,
    width: u32,
    height: u32,
) -> BitmapReadbackExplanation {
    let outcome = resolve_bitmap_readback(host, source, width, height, BitmapReadbackMode::Probe);
    BitmapReadbackExplanation {
        readable: outcome.reason == BitmapReadbackBlockReason::Ok,
        reason: outcome.reason,
    }
}
