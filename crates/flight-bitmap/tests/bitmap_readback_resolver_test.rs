use flight_bitmap::contract::*;
use std::sync::Arc;

mod resolve_bitmap_readback {
    use super::*;

    #[test]
    fn returns_empty_size_for_zero_dimensions() {
        let host = HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(|_source, _w, _h, _mode| BitmapReadbackOutcome {
                bitmap: Some(create_bitmap(1, 1, None)),
                reason: BitmapReadbackBackendReason::Ok,
            }),
        };
        let result =
            resolve_bitmap_readback(&host, &image_source(), 0, 0, BitmapReadbackMode::Bitmap);
        assert!(result.bitmap.is_none());
        assert_eq!(result.reason, BitmapReadbackBlockReason::EmptySize);
    }

    #[test]
    fn delegates_to_host_for_valid_size() {
        let host = HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(|_source, w, h, _mode| BitmapReadbackOutcome {
                bitmap: Some(create_bitmap(w, h, Some(0xaabbccff))),
                reason: BitmapReadbackBackendReason::Ok,
            }),
        };
        let result =
            resolve_bitmap_readback(&host, &image_source(), 4, 4, BitmapReadbackMode::Bitmap);
        assert!(result.bitmap.is_some());
        assert_eq!(result.reason, BitmapReadbackBlockReason::Ok);
    }
}

fn image_source() -> std::sync::Arc<HostImageSource> {
    return std::sync::Arc::new(HostImageSource {
        provider: std::sync::Arc::new(()),
        handle: std::sync::Arc::new(7_u32),
    });
}
