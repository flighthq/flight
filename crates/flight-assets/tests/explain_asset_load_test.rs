use crate::common::*;
use crate::mock_host::MockHost;
use flight_assets::contract::*;
mod explain_asset_load {
    use super::*;
    #[test]
    fn distinguishes_catalog_adapter_pending_resident_and_freed_states_without_loading() {
        let host = MockHost::new();
        let library = library(&host);
        assert_eq!(
            explain_asset_load(&library, "hero"),
            AssetLoadExplanation {
                id: "hero".to_string(),
                ref_count: 0,
                status: AssetLoadStatus::MissingDescriptor,
                r#type: None
            }
        );
        register_asset_descriptor(&library, &descriptor("hero", &[]));
        assert_eq!(
            explain_asset_load(&library, "hero"),
            AssetLoadExplanation {
                id: "hero".to_string(),
                ref_count: 0,
                status: AssetLoadStatus::MissingLoader,
                r#type: Some("image".to_string())
            }
        );
        let mock = mock_adapter();
        register_asset_loader(&library, "image", &mock.adapter);
        assert_eq!(
            explain_asset_load(&library, "hero").status,
            AssetLoadStatus::NeverAcquired
        );
        assert_eq!(*mock.calls.lock().unwrap(), 0);
        let pending = acquire(&library, "hero");
        let loading = explain_asset_load(&library, "hero");
        assert_eq!(loading.status, AssetLoadStatus::Loading);
        assert_eq!(loading.ref_count, 1);
        flush(&mock, &host);
        assert!(result(&pending).unwrap().is_ok());
        assert_eq!(
            explain_asset_load(&library, "hero").status,
            AssetLoadStatus::Resident
        );
        assert_eq!(explain_asset_load(&library, "hero").ref_count, 1);
        release_asset(&library, "hero");
        assert_eq!(
            explain_asset_load(&library, "hero").status,
            AssetLoadStatus::Freed
        );
        assert_eq!(explain_asset_load(&library, "hero").ref_count, 0);
    }
    #[test]
    fn changed_descriptor_clears_freed_history_but_equivalent_reregistration_preserves_it() {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "hero");
        let pending = acquire(&library, "hero");
        flush(&mock, &host);
        assert!(result(&pending).unwrap().is_ok());
        release_asset(&library, "hero");
        register_asset_descriptor(&library, &descriptor("hero", &[]));
        assert_eq!(
            explain_asset_load(&library, "hero").status,
            AssetLoadStatus::Freed
        );
        let changed = descriptor("hero", &[]);
        changed.write().unwrap().url = "hero-b.bin".to_string();
        register_asset_descriptor(&library, &changed);
        assert_eq!(
            explain_asset_load(&library, "hero").status,
            AssetLoadStatus::NeverAcquired
        );
    }
}
