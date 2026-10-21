use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_collision::*;
use flight_log::{
    LogData, LogLevel, LogValue, add_log_sink, clear_log_once_keys, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries, remove_log_sink,
};

fn counting_clock(calls: &Arc<AtomicUsize>) -> Arc<dyn Fn() -> f64 + Send + Sync> {
    let calls = calls.clone();
    return Arc::new(move || 1000.0 + calls.fetch_add(1, Ordering::SeqCst) as f64);
}

fn log_state() -> flight_log::LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

mod are_collision_guards_enabled {
    use super::*;

    #[test]
    fn reports_the_caller_owned_registry_pair_state() {
        let mut registry2d = crate::collision_registry2d();
        let mut registry3d = crate::collision_registry3d();
        let state = log_state();
        assert!(!are_collision_guards_enabled(&registry2d, &registry3d));
        enable_collision_guards(&mut registry2d, &mut registry3d, &state, Arc::new(|| 0.0));
        assert!(are_collision_guards_enabled(&registry2d, &registry3d));
    }
}

mod disable_collision_guards {
    use super::*;

    #[test]
    fn removes_both_guards_and_stops_sampling_the_clock() {
        let mut registry2d = crate::collision_registry2d_with_built_ins();
        let mut registry3d = crate::collision_registry3d_with_built_ins();
        let state = log_state();
        let calls = Arc::new(AtomicUsize::new(0));
        enable_collision_guards(
            &mut registry2d,
            &mut registry3d,
            &state,
            counting_clock(&calls),
        );
        disable_collision_guards(&mut registry2d, &mut registry3d);
        let point = CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 });
        let mut out = create_collision_manifold2d();
        test_collision2d(&registry2d, &point, &point, &mut out);
        assert_eq!(
            (
                are_collision_guards_enabled(&registry2d, &registry3d),
                calls.load(Ordering::SeqCst),
            ),
            (false, 0)
        );
    }
}

mod enable_collision_guards {
    use super::*;

    #[test]
    fn logs_each_dimension_and_status_once_with_live_operation_time() {
        let mut registry2d = crate::collision_registry2d_with_built_ins();
        let mut registry3d = crate::collision_registry3d_with_built_ins();
        let state = log_state();
        clear_log_once_keys(&state);
        let handle = create_memory_log_sink(8);
        add_log_sink(&state, handle.sink.clone());
        let calls = Arc::new(AtomicUsize::new(0));
        enable_collision_guards(
            &mut registry2d,
            &mut registry3d,
            &state,
            counting_clock(&calls),
        );

        let segment = CollisionShape2D::Segment(CollisionSegment2D {
            x0: 0.0,
            y0: 0.0,
            x1: 1.0,
            y1: 0.0,
        });
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 1.0,
        });
        let mut manifold2d = create_collision_manifold2d();
        test_collision2d(&registry2d, &segment, &circle, &mut manifold2d);
        test_collision2d(&registry2d, &segment, &circle, &mut manifold2d);
        test_collision2d(&registry2d, &circle, &circle, &mut manifold2d);

        let invalid_sphere = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            radius: 0.0,
        });
        let sphere = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            radius: 1.0,
        });
        let mut manifold3d = create_collision_manifold3d();
        test_collision3d(&registry3d, &invalid_sphere, &sphere, &mut manifold3d);
        test_collision3d(&registry3d, &sphere, &sphere, &mut manifold3d);

        disable_collision_guards(&mut registry2d, &mut registry3d);
        remove_log_sink(&state, &handle.sink);
        let entries = {
            let mut collected = Vec::new();
            get_memory_log_sink_entries(&mut collected, &handle);
            collected
        };
        assert_eq!(calls.load(Ordering::SeqCst), 3);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel, Some("collision".to_string()));
        assert_eq!(entries[0].timestamp_ms, 1000.0);
        assert_eq!(entries[1].timestamp_ms, 1002.0);
        match &entries[0].data {
            LogData::Record(data) => {
                assert!(
                    matches!(data.get("kind"), Some(LogValue::Str(value)) if value == "segment")
                );
                assert!(matches!(data.get("shapeIndex"), Some(LogValue::Int(0))));
                assert!(
                    matches!(data.get("status"), Some(LogValue::Str(value)) if value == "unsupported-shape-kind")
                );
                assert!(
                    matches!(data.get("message"), Some(LogValue::Str(value)) if value.contains("testSegment*Collision"))
                );
            }
            _ => panic!("expected collision guard record"),
        }
        match &entries[1].data {
            LogData::Record(data) => {
                assert!(
                    matches!(data.get("kind"), Some(LogValue::Str(value)) if value == "sphere")
                );
                assert!(
                    matches!(data.get("status"), Some(LogValue::Str(value)) if value == "degenerate-shape")
                );
                assert!(
                    matches!(data.get("message"), Some(LogValue::Str(value)) if value.contains("testCollision3D"))
                );
            }
            _ => panic!("expected collision guard record"),
        }
    }

    #[test]
    fn keeps_zero_length_capsules_and_triangular_convexes_silent() {
        let mut registry2d = crate::collision_registry2d_with_built_ins();
        let mut registry3d = crate::collision_registry3d_with_built_ins();
        let state = log_state();
        let handle = create_memory_log_sink(8);
        add_log_sink(&state, handle.sink.clone());
        let calls = Arc::new(AtomicUsize::new(0));
        enable_collision_guards(
            &mut registry2d,
            &mut registry3d,
            &state,
            counting_clock(&calls),
        );
        let capsule = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: 0.0,
            y0: 0.0,
            z0: 0.0,
            x1: 0.0,
            y1: 0.0,
            z1: 0.0,
            radius: 1.0,
        });
        let triangle = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        });
        let mut out = create_collision_manifold3d();
        test_collision3d(&registry3d, &capsule, &triangle, &mut out);
        disable_collision_guards(&mut registry2d, &mut registry3d);
        remove_log_sink(&state, &handle.sink);
        assert_eq!(
            (
                calls.load(Ordering::SeqCst),
                {
                    let mut collected = Vec::new();
                    get_memory_log_sink_entries(&mut collected, &handle);
                    collected
                }
                .len(),
            ),
            (0, 0)
        );
    }

    #[test]
    fn reports_a_non_convex_second_shape_with_its_source_status() {
        let mut registry2d = crate::collision_registry2d_with_built_ins();
        let mut registry3d = crate::collision_registry3d_with_built_ins();
        let state = log_state();
        let handle = create_memory_log_sink(8);
        add_log_sink(&state, handle.sink.clone());
        let calls = Arc::new(AtomicUsize::new(0));
        enable_collision_guards(
            &mut registry2d,
            &mut registry3d,
            &state,
            counting_clock(&calls),
        );
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 1.0,
        });
        let polygon = CollisionShape2D::Polygon(CollisionPolygon2D {
            points: vec![0.0, 0.0, 2.0, 0.0, 1.0, 0.5, 2.0, 2.0, 0.0, 2.0],
        });
        let mut out = create_collision_manifold2d();
        test_collision2d(&registry2d, &circle, &polygon, &mut out);
        disable_collision_guards(&mut registry2d, &mut registry3d);
        remove_log_sink(&state, &handle.sink);
        let entries = {
            let mut collected = Vec::new();
            get_memory_log_sink_entries(&mut collected, &handle);
            collected
        };
        let LogData::Record(data) = &entries[0].data else {
            panic!("expected collision guard record");
        };
        assert_eq!((calls.load(Ordering::SeqCst), entries.len()), (1, 1));
        assert!(matches!(data.get("shapeIndex"), Some(LogValue::Int(1))));
        assert!(matches!(
            data.get("status"),
            Some(LogValue::Str(value)) if value == "non-convex-polygon"
        ));
    }
}
