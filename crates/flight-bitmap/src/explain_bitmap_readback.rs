use crate::bitmap_readback_resolver::resolve_bitmap_readback;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_read(_source: &HostImageSource, width: u32, height: u32, _mode: BitmapReadbackMode) -> BitmapReadbackResolution {
        return BitmapReadbackResolution { bitmap: Some(create_bitmap(width, height, Some(0x10203040))), reason: BitmapReadbackBlockReason::Ok };
    }

    fn test_readback() -> HostBitmapReadbackCapability {
        return HostBitmapReadbackCapability { read_bitmap: test_read };
    }

    #[test]
    fn hostbitmapreadbackcapability_explain_bitmap_readback_matches_explain_bitmap_readback() {
        let s = test_readback();
        let ra = s.explain_bitmap_readback(&HostImageSource, 4, 4);
        let rb = explain_bitmap_readback(&s, &HostImageSource, 4, 4);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

/// Probes whether a bitmap readback would succeed.
pub fn explain_bitmap_readback(
    host_bitmap_readback: &HostBitmapReadbackCapability,
    source: &HostImageSource,
    width: u32,
    height: u32,
) -> BitmapReadbackExplanation {
    let outcome = resolve_bitmap_readback(host_bitmap_readback, source, width, height, BitmapReadbackMode::Probe);
    BitmapReadbackExplanation {
        readable: outcome.reason == BitmapReadbackBlockReason::Ok,
        reason: outcome.reason,
    }
}

impl HostBitmapReadbackCapability {
    pub fn explain_bitmap_readback(&self, source: &HostImageSource, width: u32, height: u32) -> BitmapReadbackExplanation {
        return explain_bitmap_readback(self, source, width, height);
    }
}
