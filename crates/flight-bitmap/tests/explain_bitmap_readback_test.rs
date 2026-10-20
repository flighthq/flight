use flight_bitmap::*;

mod explain_bitmap_readback_fn {
    use super::*;

    #[test]
    fn readable_for_valid_source() {
        let host = HostBitmapReadbackCapability {
            read_bitmap: |_source, _w, _h, _mode| BitmapReadbackResolution {
                bitmap: None,
                reason: BitmapReadbackBlockReason::Ok,
            },
        };
        let result = explain_bitmap_readback(&host, &HostImageSource, 4, 4);
        assert!(result.readable);
        assert_eq!(result.reason, BitmapReadbackBlockReason::Ok);
    }

    #[test]
    fn not_readable_for_empty_size() {
        let host = HostBitmapReadbackCapability {
            read_bitmap: |_source, _w, _h, _mode| BitmapReadbackResolution {
                bitmap: None,
                reason: BitmapReadbackBlockReason::Ok,
            },
        };
        let result = explain_bitmap_readback(&host, &HostImageSource, 0, 0);
        assert!(!result.readable);
        assert_eq!(result.reason, BitmapReadbackBlockReason::EmptySize);
    }

    #[test]
    fn reports_tainted_source() {
        let host = HostBitmapReadbackCapability {
            read_bitmap: |_source, _w, _h, _mode| BitmapReadbackResolution {
                bitmap: None,
                reason: BitmapReadbackBlockReason::TaintedSource,
            },
        };
        let result = explain_bitmap_readback(&host, &HostImageSource, 4, 4);
        assert!(!result.readable);
        assert_eq!(result.reason, BitmapReadbackBlockReason::TaintedSource);
    }
}
