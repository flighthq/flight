use crate::common::*;
use crate::mock_host::MockHost;
use flight_assets::contract::*;
use flight_entity::Unknown;
use flight_log::{
    LogData, LogLevel, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};
use std::sync::{Arc, RwLock};
mod are_asset_guards_enabled {
    use super::*;
    #[test]
    fn reports_guard_identity_per_library() {
        let host = MockHost::new();
        let guarded = library(&host);
        let unguarded = library(&host);
        let log = Arc::new(RwLock::new(create_log_state()));
        enable_asset_guards(&guarded, &log);
        assert!(are_asset_guards_enabled(&guarded));
        assert!(!are_asset_guards_enabled(&unguarded));
        let current = guarded
            .read()
            .unwrap()
            .library_runtime
            .read()
            .unwrap()
            .acquire_guard
            .clone()
            .unwrap();
        let wrapper: AssetAcquireGuard = Arc::new(move |library, value| current(library, value));
        set_asset_acquire_guard(&guarded, Some(wrapper));
        assert!(!are_asset_guards_enabled(&guarded));
    }
}
mod disable_asset_guards {
    use super::*;
    #[test]
    fn restores_terse_rejection_without_any_warning() {
        let host = MockHost::new();
        let library = library(&host);
        let log = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log, sink.sink.clone());
        enable_asset_guards(&library, &log);
        disable_asset_guards(&library);
        let promise = acquire_asset::<Unknown>(&library, "disabled");
        assert!(error_message(&result(&promise).unwrap().unwrap_err()).contains("no descriptor"));
        assert!(get_memory_log_sink_entries(&sink).is_empty());
    }
}
mod enable_asset_guards {
    use super::*;
    #[test]
    fn warns_once_with_exact_descriptor_guidance_data_and_live_operation_clock() {
        let host = MockHost::new();
        let library = library(&host);
        let log = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log, sink.sink.clone());
        enable_asset_guards(&library, &log);
        host.advance(23.0);
        let first = acquire_asset::<Unknown>(&library, "guard-missing-descriptor");
        let second = acquire_asset::<Unknown>(&library, "guard-missing-descriptor");
        assert!(error_message(&result(&first).unwrap().unwrap_err()).contains("no descriptor"));
        assert!(error_message(&result(&second).unwrap().unwrap_err()).contains("no descriptor"));
        let entries = get_memory_log_sink_entries(&sink);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].channel.as_deref(), Some("assets"));
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].timestamp_ms, 23.0);
        let LogData::Record(data) = &entries[0].data else {
            panic!()
        };
        assert!(matches!(&data["id"],LogValue::Str(value)if value=="guard-missing-descriptor"));
        assert!(matches!(&data["status"],LogValue::Str(value)if value=="missing-descriptor"));
        assert!(matches!(&data["type"], LogValue::Null));
        assert!(matches!(&data["refCount"], LogValue::Int(0)));
        assert!(
            matches!(&data["message"],LogValue::Str(value)if value=="acquireAsset: no descriptor is registered for id \"guard-missing-descriptor\"; call registerAssetDescriptor or registerAssetManifest before acquiring it.")
        );
        assert!(
            log.read()
                .unwrap()
                .once_keys
                .contains("assets:acquire:missing-descriptor::guard-missing-descriptor")
        );
    }
    #[test]
    fn missing_loader_warning_names_the_open_type_and_its_registration_call() {
        let host = MockHost::new();
        let library = library(&host);
        let log = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log, sink.sink.clone());
        let descriptor = descriptor("guard-missing-loader", &[]);
        descriptor.write().unwrap().r#type = "acme.custom".to_string();
        register_asset_descriptor(&library, &descriptor);
        enable_asset_guards(&library, &log);
        let promise = acquire_asset::<Unknown>(&library, "guard-missing-loader");
        assert!(error_message(&result(&promise).unwrap().unwrap_err()).contains("no loader"));
        let entries = get_memory_log_sink_entries(&sink);
        assert_eq!(entries.len(), 1);
        let LogData::Record(data) = &entries[0].data else {
            panic!()
        };
        assert!(matches!(&data["status"],LogValue::Str(value)if value=="missing-loader"));
        assert!(matches!(&data["type"],LogValue::Str(value)if value=="acme.custom"));
        assert!(
            matches!(&data["message"],LogValue::Str(value)if value=="acquireAsset: no loader is registered for type \"acme.custom\"; call registerAssetLoader before acquiring \"guard-missing-loader\".")
        );
    }
}
