use flight_bitmap::contract::*;

mod create_bitmap_from_image_source_fn {
    use super::*;

    #[test]
    fn returns_bitmap_from_host() {
        let host = HostBitmapReadbackCapability {
            read_bitmap: |_source, width, height, mode| {
                match mode {
                    BitmapReadbackMode::Bitmap => BitmapReadbackResolution {
                        bitmap: Some(create_bitmap(width, height, Some(0xff0000ff))),
                        reason: BitmapReadbackBlockReason::Ok,
                    },
                    _ => BitmapReadbackResolution {
                        bitmap: None,
                        reason: BitmapReadbackBlockReason::Ok,
                    },
                }
            },
        };
        let result = create_bitmap_from_image_source(&host, &HostImageSource, 4, 4);
        assert!(result.is_some());
        let bmp = result.unwrap();
        assert_eq!(bmp.width, 4);
        assert_eq!(bmp.height, 4);
    }

    #[test]
    fn returns_none_for_zero_size() {
        let host = HostBitmapReadbackCapability {
            read_bitmap: |_source, _w, _h, _mode| BitmapReadbackResolution {
                bitmap: None,
                reason: BitmapReadbackBlockReason::EmptySize,
            },
        };
        assert!(create_bitmap_from_image_source(&host, &HostImageSource, 0, 0).is_none());
    }
}

mod capture_bitmap_from_image_resource_fn {
    use super::*;

    #[test]
    fn delegates_to_create_bitmap_from_image_source() {
        let host = HostBitmapReadbackCapability {
            read_bitmap: |_source, width, height, _mode| BitmapReadbackResolution {
                bitmap: Some(create_bitmap(width, height, Some(0x00ff00ff))),
                reason: BitmapReadbackBlockReason::Ok,
            },
        };
        let resource = ImageResource {
            source: HostImageSource,
            width: 2,
            height: 2,
        };
        let result = capture_bitmap_from_image_resource(&host, &resource);
        assert!(result.is_some());
        assert_eq!(result.unwrap().width, 2);
    }
}
