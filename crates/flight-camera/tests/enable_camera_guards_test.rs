use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use flight_camera::contract::*;
use flight_geometry::{create_matrix4, create_rectangle, set_matrix4};
use flight_log::{
    LogData, LogEntry, LogStateRef, LogValue, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries, remove_log_sink,
};

use crate::test_support::*;

fn log_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

fn clock() -> (Arc<AtomicU64>, Arc<dyn Fn() -> f64 + Send + Sync>) {
    let ticks = Arc::new(AtomicU64::new(0));
    let clock_ticks = ticks.clone();
    let clock: Arc<dyn Fn() -> f64 + Send + Sync> = Arc::new(move || {
        return clock_ticks.fetch_add(10, Ordering::SeqCst) as f64;
    });
    return (ticks, clock);
}

fn capture_log(log: &LogStateRef, run: impl FnOnce()) -> Vec<LogEntry> {
    let sink = create_memory_log_sink(8);
    add_log_sink(log, sink.sink.clone());
    run();
    remove_log_sink(log, &sink.sink);
    return get_memory_log_sink_entries(&sink);
}

fn field(entry: &LogEntry, key: &str) -> String {
    return match &entry.data {
        LogData::Record(record) => match record.get(key) {
            Some(LogValue::Str(value)) => value.clone(),
            _ => String::new(),
        },
        LogData::Message(message) => message.clone(),
    };
}

fn numeric_field(entry: &LogEntry, key: &str) -> f64 {
    return match &entry.data {
        LogData::Record(record) => match record.get(key) {
            Some(LogValue::Float(value)) => *value,
            _ => -1.0,
        },
        LogData::Message(_) => -1.0,
    };
}

fn degenerate_camera() -> Camera2D {
    let options = Camera2DOptions {
        rotation: None,
        x: None,
        y: None,
        zoom: Some(0.0),
    };
    return camera_2d(Some(&options));
}

fn camera_3d_with_view(guard: &CameraGuardStateRef, values: [f32; 16]) -> Camera3D {
    let mut camera = camera_3d(0.1, 100.0, 1.0);
    let mut view = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    set_matrix4(
        &mut view, values[0], values[1], values[2], values[3], values[4], values[5], values[6],
        values[7], values[8], values[9], values[10], values[11], values[12], values[13],
        values[14], values[15],
    );
    set_camera_3d_view_matrix4_from_matrix4(guard, &mut camera, &view);
    return camera;
}

mod are_camera_guards_enabled {
    use super::*;

    #[test]
    fn reports_whether_the_guards_are_installed() {
        let guard = guard_state();
        let log = log_state();
        let (_, clock) = clock();
        assert!(!are_camera_guards_enabled(&guard));
        enable_camera_guards(&guard, &log, clock);
        assert!(are_camera_guards_enabled(&guard));
        disable_camera_guards(&guard);
        assert!(!are_camera_guards_enabled(&guard));
    }
}

mod disable_camera_guards {
    use super::*;

    #[test]
    fn leaves_the_core_silent_again_once_removed() {
        let guard = guard_state();
        let log = log_state();
        let (_, clock) = clock();
        enable_camera_guards(&guard, &log, clock);
        disable_camera_guards(&guard);
        let entries = capture_log(&log, || {
            let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
            get_camera_2d_visible_bounds(&guard, &degenerate_camera(), 64.0, 64.0, &mut out);
        });
        assert!(entries.is_empty());
    }
}

mod enable_camera_guards {
    use super::*;

    #[test]
    fn warns_naming_the_zoom_when_visible_bounds_cannot_be_computed() {
        let guard = guard_state();
        let log = log_state();
        let (_, clock) = clock();
        enable_camera_guards(&guard, &log, clock);
        let entries = capture_log(&log, || {
            let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
            get_camera_2d_visible_bounds(&guard, &degenerate_camera(), 64.0, 64.0, &mut out);
        });
        assert_eq!(entries.len(), 1);
        assert_eq!(numeric_field(&entries[0], "zoom"), 0.0);
        assert!(field(&entries[0], "message").contains("nothing is culled"));
    }

    #[test]
    fn warns_on_a_non_orthonormal_3d_view_naming_the_cause() {
        let guard = guard_state();
        let log = log_state();
        let (_, clock) = clock();
        enable_camera_guards(&guard, &log, clock);
        let entries = capture_log(&log, || {
            _ = camera_3d_with_view(
                &guard,
                [
                    3.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 0.0, 1.0,
                ],
            );
        });
        assert_eq!(entries.len(), 1);
        assert!(field(&entries[0], "message").contains("not orthonormal"));
    }

    #[test]
    fn stays_silent_for_a_reflection_view() {
        let guard = guard_state();
        let log = log_state();
        let (_, clock) = clock();
        enable_camera_guards(&guard, &log, clock);
        let entries = capture_log(&log, || {
            _ = camera_3d_with_view(
                &guard,
                [
                    -1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 2.0, 3.0, 4.0, 1.0,
                ],
            );
        });
        assert!(entries.is_empty());
    }

    #[test]
    fn stays_silent_for_a_camera_whose_view_matrix_adjusts() {
        let guard = guard_state();
        let log = log_state();
        let (_, clock) = clock();
        enable_camera_guards(&guard, &log, clock);
        let entries = capture_log(&log, || {
            let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
            get_camera_2d_visible_bounds(&guard, &camera_2d(None), 64.0, 64.0, &mut out);
        });
        assert!(entries.is_empty());
    }

    #[test]
    fn samples_the_clock_at_operation_time_not_enable_time() {
        let guard = guard_state();
        let log = log_state();
        let (ticks, clock) = clock();
        enable_camera_guards(&guard, &log, clock);
        let entries = capture_log(&log, || {
            let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
            get_camera_2d_visible_bounds(&guard, &degenerate_camera(), 64.0, 64.0, &mut out);
            _ = camera_3d_with_view(
                &guard,
                [
                    3.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 0.0, 1.0,
                ],
            );
        });
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].timestamp_ms, 0.0);
        assert_eq!(entries[1].timestamp_ms, 10.0);
        assert_eq!(ticks.load(Ordering::SeqCst), 20);
    }
}
