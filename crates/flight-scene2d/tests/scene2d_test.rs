use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use flight_entity::Ref;
use flight_layout::ViewportAlign;
use flight_node::{ViewportScaleMode, add_node_child};
use flight_scene2d::contract::*;
use flight_signals::connect_signal;

use crate::scene2d_fixture::*;

fn scene_options() -> Scene2DOptions {
    let make: fn() -> Scene2DOptions = Scene2DOptions::default;
    return make();
}

fn resize_count(scene2d: &Ref<Scene2D>) -> Arc<AtomicUsize> {
    let count = Arc::new(AtomicUsize::new(0));
    let record = count.clone();
    let signals = enable_scene2d_signals(&mut scene2d.write().unwrap());
    connect_signal(
        &signals.read().unwrap().on_resize,
        Arc::new(move |_| {
            record.fetch_add(1, Ordering::SeqCst);
        }),
        None,
    );
    return count;
}

fn is_scene(found: Option<Ref<Scene2D>>, scene2d: &Ref<Scene2D>) -> bool {
    return found.is_some_and(|found| Arc::ptr_eq(&found, scene2d));
}

mod create_scene2d {
    use super::*;

    #[test]
    fn initializes_default_values() {
        let scene2d = create_scene2d(None);
        let scene2d = scene2d.read().unwrap();
        assert_eq!(scene2d.color, None);
        assert_eq!(
            (scene2d.scene2d_height, scene2d.scene2d_width),
            (550.0, 400.0)
        );
        assert_eq!(
            (scene2d.align, scene2d.scale_mode),
            (ViewportAlign::TopLeft, ViewportScaleMode::NoScale)
        );
    }

    #[test]
    fn allocates_a_display_object_root_the_scene2d_points_back_to() {
        let scene2d = create_scene2d(None);
        let root = scene2d.read().unwrap().root.clone();
        assert_eq!(
            root.read().unwrap().node2d_fields().kind,
            DISPLAY_OBJECT_KIND
        );
        assert!(is_scene(get_scene2d_root(&root), &scene2d));
    }

    #[test]
    fn allows_pre_defined_values() {
        let obj = Scene2DOptions {
            color: Some(0xff0000ff),
            scene2d_height: Some(1000.0),
            scene2d_width: Some(2000.0),
            align: Some(ViewportAlign::BottomRight),
            scale_mode: Some(ViewportScaleMode::ShowAll),
        };
        let scene2d = create_scene2d(Some(&obj));
        let scene2d = scene2d.read().unwrap();
        assert_eq!(
            (scene2d.color, scene2d.scene2d_height, scene2d.scene2d_width),
            (Some(0xff0000ff), 1000.0, 2000.0)
        );
        assert_eq!(
            (scene2d.align, scene2d.scale_mode),
            (ViewportAlign::BottomRight, ViewportScaleMode::ShowAll)
        );
    }

    #[test]
    fn starts_unbound_with_no_runtime() {
        let scene2d = create_scene2d(None);
        assert!(get_scene2d_signals(&scene2d.read().unwrap()).is_none());
        assert!(flight_entity::get_entity_runtime(&*scene2d.read().unwrap()).is_none());
    }
}

mod create_scene2d_runtime {
    use super::*;

    #[test]
    fn returns_a_runtime_with_scene2d_signals_initialized_to_null() {
        assert!(create_scene2d_runtime().scene2d_signals.is_none());
    }
}

mod create_scene2d_signals {
    use super::*;

    #[test]
    fn returns_an_object_with_three_independent_signals() {
        let signals = create_scene2d_signals();
        let signals = signals.read().unwrap();
        assert!(!Arc::ptr_eq(
            &signals.on_resize.data,
            &signals.on_fullscreen_changed.data
        ));
        assert!(!Arc::ptr_eq(
            &signals.on_resize.data,
            &signals.on_orientation_changed.data
        ));
    }
}

mod enable_scene2d_signals {
    use super::*;

    #[test]
    fn returns_the_same_object_on_subsequent_calls() {
        let scene2d = create_scene2d(None);
        let first = enable_scene2d_signals(&mut scene2d.write().unwrap());
        let second = enable_scene2d_signals(&mut scene2d.write().unwrap());
        assert!(Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn makes_get_scene2d_signals_return_the_enabled_object() {
        let scene2d = create_scene2d(None);
        let signals = enable_scene2d_signals(&mut scene2d.write().unwrap());
        assert!(Arc::ptr_eq(
            &get_scene2d_signals(&scene2d.read().unwrap()).unwrap(),
            &signals
        ));
    }
}

mod get_scene2d_align_string {
    use super::*;

    #[test]
    fn round_trips_every_align() {
        for (value, text) in [
            (Scene2DAlign::Bottom, "bottom"),
            (Scene2DAlign::BottomLeft, "bottomleft"),
            (Scene2DAlign::BottomRight, "bottomright"),
            (Scene2DAlign::Left, "left"),
            (Scene2DAlign::Right, "right"),
            (Scene2DAlign::Top, "top"),
            (Scene2DAlign::TopLeft, "topleft"),
            (Scene2DAlign::TopRight, "topright"),
        ] {
            assert_eq!(get_scene2d_align_string(value), text);
            assert_eq!(parse_scene2d_align(text), Some(value));
        }
    }
}

mod get_scene2d_display_state_string {
    use super::*;

    #[test]
    fn round_trips_every_display_state() {
        for (value, text) in [
            (Scene2DDisplayState::Fullscreen, "fullscreen"),
            (
                Scene2DDisplayState::FullscreenInteractive,
                "fullscreeninteractive",
            ),
            (Scene2DDisplayState::Normal, "normal"),
        ] {
            assert_eq!(get_scene2d_display_state_string(value), text);
            assert_eq!(parse_scene2d_display_state(text), Some(value));
        }
    }
}

mod get_scene2d_quality_string {
    use super::*;

    #[test]
    fn round_trips_every_quality() {
        for (value, text) in [
            (Scene2DQuality::Best, "best"),
            (Scene2DQuality::High, "high"),
            (Scene2DQuality::Low, "low"),
            (Scene2DQuality::Medium, "medium"),
        ] {
            assert_eq!(get_scene2d_quality_string(value), text);
            assert_eq!(parse_scene2d_quality(text), Some(value));
        }
    }
}

mod get_scene2d_root {
    use super::*;

    #[test]
    fn returns_null_when_the_node_has_no_parent() {
        assert!(get_scene2d_root(&display_object()).is_none());
    }

    #[test]
    fn returns_null_when_the_root_is_not_owned_by_a_scene2d() {
        let (root, child) = (display_object(), display_object());
        add_node_child(&as_node(&root), &as_node(&child));
        assert!(get_scene2d_root(&child).is_none());
    }

    #[test]
    fn returns_the_scene2d_when_a_child_is_added_under_its_root() {
        let scene2d = create_scene2d(None);
        let child = display_object();
        add_node_child(&as_node(&scene2d.read().unwrap().root), &as_node(&child));
        assert!(is_scene(get_scene2d_root(&child), &scene2d));
    }

    #[test]
    fn returns_the_scene2d_from_a_deeply_nested_node_of_any_kind() {
        let scene2d = create_scene2d(None);
        let mid = display_object();
        let leaf: Node2DRef = create_sprite(None);
        add_node_child(&as_node(&scene2d.read().unwrap().root), &as_node(&mid));
        add_node_child(&as_node(&mid), &as_node(&leaf));
        assert!(is_scene(get_scene2d_root(&leaf), &scene2d));
    }

    #[test]
    fn a_root_passed_to_initialize_scene2d_carries_no_back_pointer() {
        let make: fn() -> Scene2D = Scene2D::default;
        let mut scene2d = make();
        let root = display_object();
        initialize_scene2d(&mut scene2d, root.clone(), None);
        assert!(Arc::ptr_eq(&scene2d.root, &root));
        assert!(get_scene2d_root(&root).is_none());
    }
}

mod get_scene2d_runtime {
    use super::*;

    #[test]
    fn allocates_the_runtime_on_first_access_without_signals() {
        let scene2d = create_scene2d(None);
        assert!(
            get_scene2d_runtime(&mut scene2d.write().unwrap())
                .scene2d_signals
                .is_none()
        );
        assert!(get_scene2d_signals(&scene2d.read().unwrap()).is_none());
    }
}

mod get_scene2d_scale_mode_string {
    use super::*;

    #[test]
    fn round_trips_every_scale_mode() {
        for (value, text) in [
            (Scene2DScaleMode::ExactFit, "exactfit"),
            (Scene2DScaleMode::NoBorder, "noborder"),
            (Scene2DScaleMode::NoScale, "noscale"),
            (Scene2DScaleMode::ShowAll, "showall"),
        ] {
            assert_eq!(get_scene2d_scale_mode_string(value), text);
            assert_eq!(parse_scene2d_scale_mode(text), Some(value));
        }
    }
}

mod get_scene2d_signals {
    use super::*;

    #[test]
    fn returns_null_before_signals_are_enabled_and_the_signals_after() {
        let scene2d = create_scene2d(None);
        assert!(get_scene2d_signals(&scene2d.read().unwrap()).is_none());
        let signals = enable_scene2d_signals(&mut scene2d.write().unwrap());
        assert!(Arc::ptr_eq(
            &get_scene2d_signals(&scene2d.read().unwrap()).unwrap(),
            &signals
        ));
    }
}

mod initialize_scene2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_scene2d() {
        let make: fn() -> Scene2D = Scene2D::default;
        let mut scene2d = make();
        let obj = Scene2DOptions {
            scene2d_width: Some(9.0),
            ..scene_options()
        };
        initialize_scene2d(&mut scene2d, display_object(), Some(&obj));
        assert_eq!(
            (scene2d.scene2d_width, scene2d.scene2d_height, scene2d.color),
            (9.0, 550.0, None)
        );
    }
}

mod initialize_scene2d_signals {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_scene2d_signals() {
        let signals = create_scene2d_signals();
        let old = signals.read().unwrap().on_resize.clone();
        initialize_scene2d_signals(&mut signals.write().unwrap());
        assert!(!Arc::ptr_eq(
            &signals.read().unwrap().on_resize.data,
            &old.data
        ));
    }
}

mod parse_scene2d_align {
    use super::*;

    #[test]
    fn rejects_strings_outside_the_source_unions() {
        assert_eq!(parse_scene2d_align("TopLeft"), None);
        assert_eq!(parse_scene2d_display_state("full"), None);
        assert_eq!(parse_scene2d_quality(""), None);
        assert_eq!(parse_scene2d_scale_mode("noScale"), None);
    }
}

mod parse_scene2d_display_state {
    use super::*;

    #[test]
    fn rejects_case_variants() {
        assert_eq!(parse_scene2d_display_state("Normal"), None);
    }
}

mod parse_scene2d_quality {
    use super::*;

    #[test]
    fn rejects_case_variants() {
        assert_eq!(parse_scene2d_quality("Best"), None);
    }
}

mod parse_scene2d_scale_mode {
    use super::*;

    #[test]
    fn rejects_case_variants() {
        assert_eq!(parse_scene2d_scale_mode("ShowAll"), None);
    }
}

mod set_scene2d_size {
    use super::*;

    #[test]
    fn updates_scene2d_width_and_scene2d_height() {
        let scene2d = create_scene2d(None);
        set_scene2d_size(&scene2d, 1920.0, 1080.0);
        assert_eq!(
            (
                scene2d.read().unwrap().scene2d_width,
                scene2d.read().unwrap().scene2d_height
            ),
            (1920.0, 1080.0)
        );
    }

    #[test]
    fn emits_on_resize_once_when_dimensions_change() {
        let scene2d = create_scene2d(None);
        let count = resize_count(&scene2d);
        set_scene2d_size(&scene2d, 1280.0, 720.0);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn emits_when_only_one_dimension_changes() {
        let scene2d = create_scene2d(None);
        let count = resize_count(&scene2d);
        set_scene2d_size(&scene2d, 400.0, 551.0);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn does_not_emit_on_resize_when_dimensions_are_unchanged() {
        let scene2d = create_scene2d(Some(&Scene2DOptions {
            scene2d_width: Some(400.0),
            scene2d_height: Some(300.0),
            ..scene_options()
        }));
        let count = resize_count(&scene2d);
        set_scene2d_size(&scene2d, 400.0, 300.0);
        assert_eq!(count.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn does_not_emit_or_allocate_when_no_one_has_subscribed() {
        let scene2d = create_scene2d(None);
        set_scene2d_size(&scene2d, 1280.0, 720.0);
        assert!(get_scene2d_signals(&scene2d.read().unwrap()).is_none());
    }

    #[test]
    fn releases_the_scene_before_emitting_so_listeners_can_read_it() {
        let scene2d = create_scene2d(None);
        let signals = enable_scene2d_signals(&mut scene2d.write().unwrap());
        let seen = Arc::new(std::sync::Mutex::new(0.0));
        let (reader, record) = (scene2d.clone(), seen.clone());
        connect_signal(
            &signals.read().unwrap().on_resize,
            Arc::new(move |_| {
                *record.lock().unwrap() = reader.read().unwrap().scene2d_width;
            }),
            None,
        );
        set_scene2d_size(&scene2d, 640.0, 480.0);
        assert_eq!(*seen.lock().unwrap(), 640.0);
    }
}
