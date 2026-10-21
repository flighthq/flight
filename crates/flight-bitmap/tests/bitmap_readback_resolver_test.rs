use flight_bitmap::contract::*;

mod resolve_bitmap_readback_fn {
    use super::*;

    #[test]
    fn returns_empty_size_for_zero_dimensions() {
        let host = HostBitmapReadbackCapability {
            read_bitmap: |_source, _w, _h, _mode| BitmapReadbackResolution {
                bitmap: Some(create_bitmap(1, 1, None)),
                reason: BitmapReadbackBlockReason::Ok,
            },
        };
        let result = resolve_bitmap_readback(&host, &HostImageSource, 0, 0, BitmapReadbackMode::Bitmap);
        assert!(result.bitmap.is_none());
        assert_eq!(result.reason, BitmapReadbackBlockReason::EmptySize);
    }

    #[test]
    fn delegates_to_host_for_valid_size() {
        let host = HostBitmapReadbackCapability {
            read_bitmap: |_source, w, h, _mode| BitmapReadbackResolution {
                bitmap: Some(create_bitmap(w, h, Some(0xaabbccff))),
                reason: BitmapReadbackBlockReason::Ok,
            },
        };
        let result = resolve_bitmap_readback(&host, &HostImageSource, 4, 4, BitmapReadbackMode::Bitmap);
        assert!(result.bitmap.is_some());
        assert_eq!(result.reason, BitmapReadbackBlockReason::Ok);
    }
}
