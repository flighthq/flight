use flight_bitmap::contract::*;
use std::sync::Arc;

mod explain_bitmap_readback {
    use super::*;

    #[test]
    fn readable_for_valid_source() {
        let host = HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(|_source, _w, _h, _mode| BitmapReadbackOutcome {
                bitmap: None,
                reason: BitmapReadbackBackendReason::Ok,
            }),
        };
        let result = explain_bitmap_readback(&host, &image_source(), 4, 4);
        assert!(result.readable);
        assert_eq!(result.reason, BitmapReadbackBlockReason::Ok);
    }

    #[test]
    fn not_readable_for_empty_size() {
        let host = HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(|_source, _w, _h, _mode| BitmapReadbackOutcome {
                bitmap: None,
                reason: BitmapReadbackBackendReason::Ok,
            }),
        };
        let result = explain_bitmap_readback(&host, &image_source(), 0, 0);
        assert!(!result.readable);
        assert_eq!(result.reason, BitmapReadbackBlockReason::EmptySize);
    }

    #[test]
    fn reports_tainted_source() {
        let host = HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(|_source, _w, _h, _mode| BitmapReadbackOutcome {
                bitmap: None,
                reason: BitmapReadbackBackendReason::TaintedSource,
            }),
        };
        let result = explain_bitmap_readback(&host, &image_source(), 4, 4);
        assert!(!result.readable);
        assert_eq!(result.reason, BitmapReadbackBlockReason::TaintedSource);
    }
}

fn image_source() -> std::sync::Arc<HostImageSource> {
    return std::sync::Arc::new(HostImageSource {
        provider: std::sync::Arc::new(()),
        handle: std::sync::Arc::new(7_u32),
    });
}
