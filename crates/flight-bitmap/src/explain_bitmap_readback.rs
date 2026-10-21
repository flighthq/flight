use std::sync::Arc;

use crate::bitmap_readback_resolver::resolve_bitmap_readback;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::Arc;

    use crate::contract::*;

    fn test_source() -> Arc<HostImageSource> {
        return Arc::new(HostImageSource {
            provider: Arc::new(()),
            handle: Arc::new(7_u32),
        });
    }

    fn test_read(
        _source: &Arc<HostImageSource>,
        width: u32,
        height: u32,
        _mode: BitmapReadbackMode,
    ) -> BitmapReadbackOutcome {
        return BitmapReadbackOutcome {
            bitmap: Some(create_bitmap(width, height, Some(0x10203040))),
            reason: BitmapReadbackBackendReason::Ok,
        };
    }

    fn test_readback() -> HostBitmapReadbackCapability {
        return HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(test_read),
        };
    }

    #[test]
    fn hostbitmapreadbackcapability_explain_bitmap_readback_matches_explain_bitmap_readback() {
        let s = test_readback();
        let ra = s.explain_bitmap_readback(&test_source(), 4, 4);
        let rb = explain_bitmap_readback(&s, &test_source(), 4, 4);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

/// Probes whether a bitmap readback would succeed.
pub fn explain_bitmap_readback(
    host_bitmap_readback: &HostBitmapReadbackCapability,
    source: &Arc<HostImageSource>,
    width: u32,
    height: u32,
) -> BitmapReadbackExplanation {
    let outcome = resolve_bitmap_readback(
        host_bitmap_readback,
        source,
        width,
        height,
        BitmapReadbackMode::Probe,
    );
    BitmapReadbackExplanation {
        readable: outcome.reason == BitmapReadbackBlockReason::Ok,
        reason: outcome.reason,
    }
}

impl HostBitmapReadbackCapability {
    pub fn explain_bitmap_readback(
        &self,
        source: &Arc<HostImageSource>,
        width: u32,
        height: u32,
    ) -> BitmapReadbackExplanation {
        return explain_bitmap_readback(self, source, width, height);
    }
}
