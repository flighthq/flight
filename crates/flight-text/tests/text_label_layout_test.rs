//! flight-compiler: target-native

use std::sync::{Arc, Mutex};

use flight_node::NodeRef;
use flight_textlayout::create_text_metrics;

use super::*;

fn measured_rich_text() -> flight_entity::Ref<RichText> {
    return create_test_rich_text(Some(&TestRichText {
        data: None,
        layout_context: Some(measured_text_context()),
    }));
}

mod ensure_text_layout {
    use super::*;

    #[test]
    fn computes_a_layout_for_a_rich_text_once_a_provider_is_registered() {
        let rich_text = measured_rich_text();
        set_rich_text_string(&rich_text, "hello");
        let node: NodeRef = rich_text.clone();
        ensure_text_layout(&node);
        assert!(get_text_layout(&node).is_some());
    }

    #[test]
    fn computes_a_layout_for_a_text_label_via_the_shared_path() {
        let label = measured_text_label("");
        set_text_label_string(&label, "hi");
        let node: NodeRef = label.clone();
        ensure_text_layout(&node);
        assert!(get_text_layout(&node).is_some());
    }

    #[test]
    fn leaves_the_layout_null_when_no_measure_provider_is_registered() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        let node: NodeRef = rich_text.clone();
        ensure_text_layout(&node);
        assert!(get_text_layout(&node).is_none());
    }
}

mod get_text_layout {
    use super::*;

    #[test]
    fn ensures_the_layout_and_returns_it() {
        let rich_text = measured_rich_text();
        set_rich_text_string(&rich_text, "hi");
        let node: NodeRef = rich_text.clone();
        assert!(get_text_layout(&node).is_some());
    }
}

mod get_text_layout_metrics {
    use super::*;

    #[test]
    fn measures_the_content_size_for_a_rich_text() {
        let rich_text = measured_rich_text();
        set_rich_text_string(&rich_text, "hello");
        let node: NodeRef = rich_text.clone();
        let mut out = create_text_metrics();
        get_text_layout_metrics(&mut out, &node);
        assert!(out.width > 0.0);
        assert!(out.num_lines >= 1);
    }

    #[test]
    fn measures_the_content_size_for_a_text_label() {
        let label = measured_text_label("");
        set_text_label_string(&label, "hello");
        let node: NodeRef = label.clone();
        let mut out = create_text_metrics();
        get_text_layout_metrics(&mut out, &node);
        assert!(out.width > 0.0);
    }

    #[test]
    fn zeroes_the_metrics_when_no_provider_is_registered() {
        let rich_text = create_rich_text(None);
        set_rich_text_string(&rich_text, "hello");
        let node: NodeRef = rich_text.clone();
        let mut out = create_text_metrics();
        out.width = 99.0;
        get_text_layout_metrics(&mut out, &node);
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
        assert_eq!(out.num_lines, 0);
    }
}

mod set_text_label_guard {
    use super::*;

    #[test]
    fn accepts_none_to_remove_the_guard() {
        let context = measured_text_context();
        let label = create_test_text_label(Some(&TestTextLabel {
            data: None,
            layout_context: Some(context.clone()),
        }));
        let node: NodeRef = label.clone();
        set_text_label_string(&label, "first");
        ensure_text_layout(&node);
        let called = Arc::new(Mutex::new(false));
        let guard_called = called.clone();
        set_text_label_guard(
            &context,
            Some(Arc::new(move |_, _| *guard_called.lock().unwrap() = true)),
        );
        set_text_label_guard(&context, None);
        label.write().unwrap().data.text = "second".to_string();
        ensure_text_layout(&node);
        assert!(!*called.lock().unwrap());
    }

    #[test]
    fn calls_the_guard_when_live_text_disagrees_with_rasterized_text() {
        let context = measured_text_context();
        let label = create_test_text_label(Some(&TestTextLabel {
            data: None,
            layout_context: Some(context.clone()),
        }));
        let node: NodeRef = label.clone();
        set_text_label_string(&label, "first");
        ensure_text_layout(&node);
        let captured = Arc::new(Mutex::new(None));
        let guard_captured = captured.clone();
        set_text_label_guard(
            &context,
            Some(Arc::new(move |live, rasterized| {
                *guard_captured.lock().unwrap() = Some((live.to_string(), rasterized.to_string()));
            })),
        );
        label.write().unwrap().data.text = "second".to_string();
        ensure_text_layout(&node);
        assert_eq!(
            captured.lock().unwrap().as_ref(),
            Some(&("second".to_string(), "first".to_string()))
        );
    }

    #[test]
    fn does_not_call_the_guard_when_content_revision_was_bumped() {
        let context = measured_text_context();
        let label = create_test_text_label(Some(&TestTextLabel {
            data: None,
            layout_context: Some(context.clone()),
        }));
        let node: NodeRef = label.clone();
        set_text_label_string(&label, "first");
        ensure_text_layout(&node);
        let called = Arc::new(Mutex::new(false));
        let guard_called = called.clone();
        set_text_label_guard(
            &context,
            Some(Arc::new(move |_, _| *guard_called.lock().unwrap() = true)),
        );
        set_text_label_string(&label, "second");
        ensure_text_layout(&node);
        assert!(!*called.lock().unwrap());
    }
}
