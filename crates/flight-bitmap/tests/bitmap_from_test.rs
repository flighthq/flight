use flight_bitmap::contract::*;
use flight_host::HostImageSource;
use std::sync::Arc;

mod create_bitmap_from_image_source {
    use super::*;

    #[test]
    fn returns_bitmap_from_host() {
        let host = HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(|_source, width, height, mode| match mode {
                BitmapReadbackMode::Bitmap => BitmapReadbackOutcome {
                    bitmap: Some(create_bitmap(width, height, Some(0xff0000ff))),
                    reason: BitmapReadbackBackendReason::Ok,
                },
                _ => BitmapReadbackOutcome {
                    bitmap: None,
                    reason: BitmapReadbackBackendReason::Ok,
                },
            }),
        };
        let result = create_bitmap_from_image_source(&host, &image_source(), 4, 4);
        assert!(result.is_some());
        let bmp = result.unwrap();
        assert_eq!(bmp.width, 4);
        assert_eq!(bmp.height, 4);
    }

    #[test]
    fn returns_none_for_zero_size() {
        let host = HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(|_source, _w, _h, _mode| BitmapReadbackOutcome {
                bitmap: None,
                reason: BitmapReadbackBackendReason::Ok,
            }),
        };
        assert!(create_bitmap_from_image_source(&host, &image_source(), 0, 0).is_none());
    }
}

fn image_source() -> std::sync::Arc<HostImageSource> {
    return std::sync::Arc::new(HostImageSource {
        provider: std::sync::Arc::new(()),
        handle: std::sync::Arc::new(7_u32),
    });
}
