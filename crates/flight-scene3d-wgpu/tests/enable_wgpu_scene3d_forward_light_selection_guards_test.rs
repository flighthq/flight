use std::sync::{Arc, RwLock};

use flight_lighting::{create_point_light, create_scene_3d_lights};
use flight_log::{
    LogData, LogEntry, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};
use flight_scene3d_wgpu::*;

use crate::support::*;

mod are_wgpu_scene3d_forward_light_selection_guards_enabled {
    use super::*;

    #[test]
    fn reports_false_before_installation_and_true_afterward() {
        let mut test = make_wgpu_scene3d_state(None);
        assert!(!are_wgpu_scene3d_forward_light_selection_guards_enabled(&mut test.state));
        enable_wgpu_scene3d_forward_light_selection_guards(&mut test.state, None);
        assert!(are_wgpu_scene3d_forward_light_selection_guards_enabled(&mut test.state));
    }
}

mod enable_wgpu_scene3d_forward_light_selection_guards {
    use super::*;

    #[test]
    fn installs_the_opt_in_warning_with_actionable_selection_guidance() {
        let mut test = make_wgpu_scene3d_state(None);
        let logs = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(4);
        add_log_sink(&logs, sink.sink.clone());
        enable_wgpu_scene3d_forward_light_selection_guards(&mut test.state, Some(logs));
        let mut lights = create_scene_3d_lights();
        lights.point = (0..5)
            .map(|_| Arc::new(RwLock::new(create_point_light())))
            .collect();

        let guard = get_wgpu_scene3d_runtime(&mut test.state)
            .forward_light_selection_guard
            .unwrap();
        guard(&test.state, &lights);

        let mut entries: Vec<LogEntry> = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 1);
        let LogData::Record(data) = &entries[0].data else {
            panic!("a record entry");
        };
        let Some(LogValue::Str(message)) = data.get("message") else {
            panic!("a message");
        };
        assert!(message.contains("prepareWgpuScene3DForwardLights"));
    }
}
