use flight_bitmap::contract::*;
use std::sync::{Arc, Mutex};

use flight_host::{HostImageSource, ProviderRef};

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

    #[test]
    fn hands_the_host_the_exact_shared_source_size_and_mode() {
        let seen: Arc<Mutex<Vec<(Arc<HostImageSource>, u32, u32, BitmapReadbackMode)>>> =
            Arc::new(Mutex::new(Vec::new()));
        let record = seen.clone();
        let host = HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(move |source, w, h, mode| {
                record.lock().unwrap().push((source.clone(), w, h, mode));
                return BitmapReadbackOutcome {
                    bitmap: None,
                    reason: BitmapReadbackBackendReason::Ok,
                };
            }),
        };
        let source = image_source();
        resolve_bitmap_readback(&host, &source, 3, 5, BitmapReadbackMode::Probe);
        let calls = seen.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert!(Arc::ptr_eq(&calls[0].0, &source));
        assert!(Arc::ptr_eq(&calls[0].0.handle, &source.handle));
        assert_eq!(
            (calls[0].1, calls[0].2, calls[0].3),
            (3, 5, BitmapReadbackMode::Probe)
        );
    }

    #[test]
    fn short_circuits_empty_sizes_without_invoking_the_host() {
        let calls = Arc::new(Mutex::new(0_u32));
        let count = calls.clone();
        let host = HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(move |_source, _w, _h, _mode| {
                *count.lock().unwrap() += 1;
                return BitmapReadbackOutcome {
                    bitmap: Some(create_bitmap(1, 1, None)),
                    reason: BitmapReadbackBackendReason::Ok,
                };
            }),
        };
        for (w, h) in [(0, 4), (4, 0), (0, 0)] {
            let result =
                resolve_bitmap_readback(&host, &image_source(), w, h, BitmapReadbackMode::Bitmap);
            assert!(result.bitmap.is_none());
            assert_eq!(result.reason, BitmapReadbackBlockReason::EmptySize);
        }
        assert_eq!(*calls.lock().unwrap(), 0);
    }

    #[test]
    fn maps_each_backend_reason_to_the_same_block_reason() {
        for (backend, block) in [
            (
                BitmapReadbackBackendReason::NoCanvas,
                BitmapReadbackBlockReason::NoCanvas,
            ),
            (
                BitmapReadbackBackendReason::Ok,
                BitmapReadbackBlockReason::Ok,
            ),
            (
                BitmapReadbackBackendReason::TaintedSource,
                BitmapReadbackBlockReason::TaintedSource,
            ),
        ] {
            let host = HostBitmapReadbackCapability {
                provider: Arc::new(()),
                read_bitmap: Arc::new(move |_source, _w, _h, _mode| BitmapReadbackOutcome {
                    bitmap: None,
                    reason: backend,
                }),
            };
            let result =
                resolve_bitmap_readback(&host, &image_source(), 1, 1, BitmapReadbackMode::Probe);
            assert_eq!(result.reason, block);
        }
    }

    #[test]
    fn retains_the_shared_provider_object() {
        let provider: ProviderRef = Arc::new("readback-host");
        let host = HostBitmapReadbackCapability {
            provider: provider.clone(),
            read_bitmap: Arc::new(|_source, _w, _h, _mode| BitmapReadbackOutcome {
                bitmap: None,
                reason: BitmapReadbackBackendReason::Ok,
            }),
        };
        let copy = host.clone();
        assert!(Arc::ptr_eq(&host.provider, &provider));
        assert!(Arc::ptr_eq(&copy.provider, &provider));
        assert!(Arc::ptr_eq(&copy.read_bitmap, &host.read_bitmap));
    }

    #[test]
    #[should_panic(expected = "readback failed")]
    fn propagates_host_readback_faults() {
        let host = HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(|_source, _w, _h, _mode| panic!("readback failed")),
        };
        resolve_bitmap_readback(&host, &image_source(), 2, 2, BitmapReadbackMode::Bitmap);
    }
}

fn image_source() -> std::sync::Arc<HostImageSource> {
    return std::sync::Arc::new(HostImageSource {
        provider: std::sync::Arc::new(()),
        handle: std::sync::Arc::new(7_u32),
    });
}
