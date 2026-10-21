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
    fn bitmap_from_image_source_matches_create_bitmap_from_image_source() {
        let a = Bitmap::from_image_source(&test_readback(), &test_source(), 4, 4);
        let b = create_bitmap_from_image_source(&test_readback(), &test_source(), 4, 4);
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn hostbitmapreadbackcapability_capture_bitmap_from_image_resource_matches_capture_bitmap_from_image_resource()
     {
        let s = test_readback();
        let ra = s.capture_bitmap_from_image_resource(&ImageResource {
            source: test_source(),
            width: 2,
            height: 2,
        });
        let rb = capture_bitmap_from_image_resource(
            &s,
            &ImageResource {
                source: test_source(),
                width: 2,
                height: 2,
            },
        );
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

/// Creates a bitmap from a host image source.
pub fn create_bitmap_from_image_source(
    host_bitmap_readback: &HostBitmapReadbackCapability,
    source: &Arc<HostImageSource>,
    width: u32,
    height: u32,
) -> Option<Bitmap> {
    resolve_bitmap_readback(
        host_bitmap_readback,
        source,
        width,
        height,
        BitmapReadbackMode::Bitmap,
    )
    .bitmap
}

/// Captures a bitmap from an image resource via the host readback capability.
pub fn capture_bitmap_from_image_resource(
    host_bitmap_readback: &HostBitmapReadbackCapability,
    resource: &ImageResource,
) -> Option<Bitmap> {
    create_bitmap_from_image_source(
        host_bitmap_readback,
        &resource.source,
        resource.width,
        resource.height,
    )
}

impl Bitmap {
    pub fn from_image_source(
        host_bitmap_readback: &HostBitmapReadbackCapability,
        source: &Arc<HostImageSource>,
        width: u32,
        height: u32,
    ) -> Option<Bitmap> {
        return create_bitmap_from_image_source(host_bitmap_readback, source, width, height);
    }
}

impl HostBitmapReadbackCapability {
    pub fn capture_bitmap_from_image_resource(&self, resource: &ImageResource) -> Option<Bitmap> {
        return capture_bitmap_from_image_resource(self, resource);
    }
}
