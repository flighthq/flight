use std::sync::{Arc, RwLock};

use flight_entity::allocate_entity;
use flight_image::contract::{ImageResourceFailure, ImageResourceFailureKind};
use flight_log::{
    LogData, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};
use flight_materials::{STANDARD_PBR_MATERIAL_KIND, UNLIT_MATERIAL_KIND};
use flight_resource::ResourceResolutionState;
use flight_scene3d_resources::contract::*;
use flight_signals::emit_signal;

use crate::mock_host::MockHost;
use crate::support::*;

// The source bundles single exports with esbuild and inspects the output text. Rust links whole
// crates, so these cases assert the separation that bundle check protects, observably: which
// families each constructor wires, and that failure logging exists only behind the guard.
mod scene_resource_resolver_tree_shaking {
    use super::*;

    fn failed_event() -> Scene3DResourceEvent {
        let reference = external_reference("bad.png");
        let mut failure: ImageResourceFailure = allocate_entity();
        initialize_image_resource_failure(
            &mut failure,
            ImageResourceFailureKind::Error,
            "bad image".to_string(),
            None,
        );
        set_reference_resolution(&reference, Some(failure), ResourceResolutionState::Failed);
        let texture = attach_texture(&reference);
        return Scene3DResourceEvent { reference, texture };
    }

    #[test]
    fn keeps_the_primitive_resolver_independent_of_built_in_material_listers() {
        let host = MockHost::new();
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        {
            let registry = resolver.read().unwrap().registry.clone();
            let listers = registry.listers.read().unwrap();
            assert!(!listers.contains_key(STANDARD_PBR_MATERIAL_KIND));
            assert!(!listers.contains_key(UNLIT_MATERIAL_KIND));
        }
        // No guard installed: a failure event reaches no log at all.
        let sink = create_memory_log_sink(4);
        let logs = Arc::new(RwLock::new(create_log_state()));
        add_log_sink(&logs, sink.sink.clone());
        let signals = enable_scene3d_resource_signals(&resolver);
        let failed = signals.read().unwrap().on_resource_failed.clone();
        emit_signal(&failed, &failed_event());
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert!(entries.is_empty());
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn includes_built_in_material_listers_only_through_the_named_assembly() {
        let host = MockHost::new();
        let resolver =
            create_built_in_scene3d_resource_resolver(&host_image(), None, &context(&host));
        {
            let registry = resolver.read().unwrap().registry.clone();
            let listers = registry.listers.read().unwrap();
            assert!(listers.contains_key(STANDARD_PBR_MATERIAL_KIND));
            assert!(listers.contains_key(UNLIT_MATERIAL_KIND));
        }
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn includes_failure_logging_only_through_the_separately_imported_guard() {
        let host = MockHost::new();
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let sink = create_memory_log_sink(4);
        let logs = Arc::new(RwLock::new(create_log_state()));
        add_log_sink(&logs, sink.sink.clone());
        enable_scene3d_resource_failure_guards(&resolver, &logs, Arc::new(|| 0.0));
        let signals = enable_scene3d_resource_signals(&resolver);
        let failed = signals.read().unwrap().on_resource_failed.clone();
        emit_signal(&failed, &failed_event());
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 1);
        let LogData::Record(data) = &entries[0].data else {
            panic!("guard logs a record");
        };
        let Some(LogValue::Str(message)) = data.get("message") else {
            panic!("guard logs a message");
        };
        assert!(message.contains("Scene3D resource acquisition failed"));
        dispose_scene3d_resource_resolver(&resolver);
    }
}
