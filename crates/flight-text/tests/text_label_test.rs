use std::sync::Arc;

use flight_entity::Ref;
use flight_geometry::create_rectangle;
use flight_node::{Node, get_node_local_bounds_revision, get_node_local_content_revision};
use flight_scene2d::get_node2d_runtime;
use flight_textlayout::{TextAutoSize, TextVerticalAlign};

use super::*;

fn create_label_with_data(data: TestTextLabelData) -> Ref<TextLabel> {
    return create_test_text_label(Some(&TestTextLabel {
        data: Some(data),
        layout_context: None,
    }));
}

fn create_measured_label_with_data(data: TestTextLabelData) -> Ref<TextLabel> {
    return create_test_text_label(Some(&TestTextLabel {
        data: Some(data),
        layout_context: Some(measured_text_context()),
    }));
}

mod append_text_label_string {
    use super::*;

    #[test]
    fn appends_the_value_to_the_existing_text() {
        let mut data = text_label_options();
        data.text = Some("hello".to_string());
        let text = create_label_with_data(data);
        append_text_label_string(&text, " world");
        assert_eq!(text.read().unwrap().data.text, "hello world");
    }

    #[test]
    fn does_not_invalidate_when_value_is_empty() {
        let mut data = text_label_options();
        data.text = Some("hi".to_string());
        let text = create_label_with_data(data);
        let content = get_node_local_content_revision(&*text.read().unwrap());
        append_text_label_string(&text, "");
        assert_eq!(
            get_node_local_content_revision(&*text.read().unwrap()),
            content
        );
    }

    #[test]
    fn invalidates_local_content_after_append() {
        let mut data = text_label_options();
        data.text = Some("hi".to_string());
        let text = create_label_with_data(data);
        let content = get_node_local_content_revision(&*text.read().unwrap());
        append_text_label_string(&text, "!");
        assert_eq!(
            get_node_local_content_revision(&*text.read().unwrap()),
            content + 1
        );
    }
}

mod compute_text_label_local_bounds_rectangle {
    use super::*;

    #[test]
    fn falls_back_to_the_fixed_box_under_auto_size_without_a_provider() {
        let mut data = text_label_options();
        data.auto_size = Some(TextAutoSize::Left);
        data.width = Some(200.0);
        data.height = Some(50.0);
        let text = create_label_with_data(data);
        set_text_label_string(&text, "hi");
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_text_label_local_bounds_rectangle(&mut out, &*text.read().unwrap());
        assert_eq!(out.width, 200.0);
        assert_eq!(out.height, 50.0);
    }

    #[test]
    fn grows_to_the_measured_run_under_auto_size_left() {
        let mut data = text_label_options();
        data.auto_size = Some(TextAutoSize::Left);
        data.width = Some(200.0);
        data.height = Some(50.0);
        let text = create_measured_label_with_data(data);
        set_text_label_string(&text, "hi");
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_text_label_local_bounds_rectangle(&mut out, &*text.read().unwrap());
        assert_eq!(out.x, 0.0);
        assert!(out.width > 0.0);
        assert!(out.width < 200.0);
    }

    #[test]
    fn sets_out_dimensions_from_data_when_auto_size_is_none() {
        let mut data = text_label_options();
        data.width = Some(200.0);
        data.height = Some(50.0);
        let text = create_label_with_data(data);
        let mut out = create_rectangle(7.0, 9.0, 0.0, 0.0);
        compute_text_label_local_bounds_rectangle(&mut out, &*text.read().unwrap());
        assert_eq!(out.x, 0.0);
        assert_eq!(out.width, 200.0);
        assert_eq!(out.height, 50.0);
    }
}

mod create_text_label {
    use super::*;

    #[test]
    fn allows_pre_defined_values() {
        let mut data = text_label_options();
        data.auto_size = Some(TextAutoSize::Left);
        data.text = Some("foo".to_string());
        data.width = Some(300.0);
        data.height = Some(40.0);
        let text = create_label_with_data(data);
        let text = text.read().unwrap();
        assert_eq!(text.data.auto_size, TextAutoSize::Left);
        assert_eq!(text.data.text, "foo");
        assert_eq!(text.data.width, 300.0);
        assert_eq!(text.data.height, 40.0);
    }

    #[test]
    fn initializes_default_values() {
        let text = create_text_label(None);
        let text = text.read().unwrap();
        assert_eq!(text.data.text, "");
        assert_eq!(text.data.auto_size, TextAutoSize::None);
        assert_eq!(text.data.width, 100.0);
        assert_eq!(text.data.height, 100.0);
        assert_eq!(text.node_fields().kind, TEXT_LABEL_KIND);
    }

    #[test]
    fn returns_a_new_object_for_stable_layout() {
        let options = TestTextLabel {
            data: None,
            layout_context: None,
        };
        let text = create_test_text_label(Some(&options));
        assert_eq!(text.read().unwrap().node_fields().kind, TEXT_LABEL_KIND);
    }
}

mod create_text_label_data {
    use super::*;

    // D23 B: the source's pre-defined values are assigned after the zero-field create.
    #[test]
    fn allows_pre_defined_values() {
        let mut data = create_text_label_data();
        data.auto_size = TextAutoSize::Left;
        data.text = "hello".to_string();
        data.width = 250.0;
        data.height = 30.0;
        assert_eq!(data.auto_size, TextAutoSize::Left);
        assert_eq!(data.text, "hello");
        assert_eq!(data.width, 250.0);
        assert_eq!(data.height, 30.0);
    }

    #[test]
    fn returns_default_values() {
        let data = create_text_label_data();
        assert_eq!(data.auto_size, TextAutoSize::None);
        assert_eq!(data.height, 100.0);
        assert_eq!(data.text, "");
        assert_eq!(data.width, 100.0);
    }
}

mod create_text_label_runtime {
    use super::*;

    #[test]
    fn returns_a_non_null_runtime() {
        let runtime = create_text_label_runtime();
        assert_eq!(runtime.text_layout_using_content_id, -1);
    }

    #[test]
    fn starts_without_attached_layout_runtime_state() {
        let runtime = create_text_label_runtime();
        assert!(runtime.text_layout.is_none());
    }

    #[test]
    fn uses_compute_text_label_local_bounds_rectangle() {
        create_text_label_runtime();
        let text = create_text_label(None);
        let text_read = text.read().unwrap();
        let callback = get_node2d_runtime(&*text_read)
            .bounds
            .compute_local_bounds_rectangle
            .clone();
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        callback(&mut out, &*text_read);
        assert_eq!(out.width, 100.0);
    }
}

mod get_text_label_format {
    use super::*;

    #[test]
    fn returns_the_text_format_field() {
        let mut format = empty_text_format();
        format.size = Some(24.0);
        format.bold = Some(true);
        let format = format_ref(format);
        let mut data = text_label_options();
        data.text_format = Some(format.clone());
        let text = create_label_with_data(data);
        assert!(Arc::ptr_eq(
            &get_text_label_format(&*text.read().unwrap()),
            &format
        ));
    }
}

mod get_text_label_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_for_a_text_label() {
        let text = create_text_label(None);
        let first = get_text_label_runtime(&*text.read().unwrap());
        let second = get_text_label_runtime(&*text.read().unwrap());
        assert!(Arc::ptr_eq(&first, &second));
    }
}

mod get_text_label_string {
    use super::*;

    #[test]
    fn returns_the_text_field() {
        let mut data = text_label_options();
        data.text = Some("hello".to_string());
        let text = create_label_with_data(data);
        assert_eq!(get_text_label_string(&*text.read().unwrap()), "hello");
    }
}

mod initialize_text_label {
    use super::*;

    // The construction initializer keeps the receiver's entity identity, resets the label data and
    // binds a fresh layout runtime to the supplied context.
    #[test]
    fn is_the_construction_initializer_of_create_text_label() {
        let context = measured_text_context();
        let label = create_text_label(None);
        let mut label = label.write().unwrap();
        flight_entity::set_entity_uid(&mut *label, "label".to_string());
        label.data.text = "stale".to_string();
        initialize_text_label(&mut label, Some(context.clone()));
        assert_eq!(flight_entity::get_entity_uid(&mut *label), "label");
        assert_eq!(label.data.text, "");
        assert_eq!(label.data.width, 100.0);
        let runtime = get_text_label_runtime(&label);
        assert!(Arc::ptr_eq(
            &runtime.read().unwrap().layout_context,
            &context
        ));
    }
}

mod initialize_text_label_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_text_label_data() {
        let mut data = create_text_label_data();
        data.text = "stale".to_string();
        data.vertical_align = TextVerticalAlign::Bottom;
        initialize_text_label_data(&mut data);
        assert_eq!(data.text, "");
        assert_eq!(data.vertical_align, TextVerticalAlign::Top);
        assert_eq!(data.height, 100.0);
    }
}

mod set_text_label_auto_size {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let text = create_text_label(None);
        let content = get_node_local_content_revision(&*text.read().unwrap());
        set_text_label_auto_size(&text, TextAutoSize::None);
        assert_eq!(
            get_node_local_content_revision(&*text.read().unwrap()),
            content
        );
    }

    #[test]
    fn sets_auto_size_bumps_content_and_invalidates_local_bounds() {
        let text = create_text_label(None);
        let content = get_node_local_content_revision(&*text.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*text.read().unwrap());
        set_text_label_auto_size(&text, TextAutoSize::Left);
        assert_eq!(text.read().unwrap().data.auto_size, TextAutoSize::Left);
        assert_eq!(
            get_node_local_content_revision(&*text.read().unwrap()),
            content + 1
        );
        assert_ne!(
            get_node_local_bounds_revision(&*text.read().unwrap()),
            bounds
        );
    }
}

mod set_text_label_format {
    use super::*;

    #[test]
    fn sets_the_format_and_bumps_content_without_touching_bounds() {
        let text = create_text_label(None);
        let content = get_node_local_content_revision(&*text.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*text.read().unwrap());
        let mut format = empty_text_format();
        format.size = Some(24.0);
        let format = format_ref(format);
        set_text_label_format(&text, format.clone());
        assert!(Arc::ptr_eq(&text.read().unwrap().data.text_format, &format));
        assert_eq!(
            get_node_local_content_revision(&*text.read().unwrap()),
            content + 1
        );
        assert_eq!(
            get_node_local_bounds_revision(&*text.read().unwrap()),
            bounds
        );
    }
}

mod set_text_label_height {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let text = create_text_label(None);
        let content = get_node_local_content_revision(&*text.read().unwrap());
        let height = text.read().unwrap().data.height;
        set_text_label_height(&text, height);
        assert_eq!(
            get_node_local_content_revision(&*text.read().unwrap()),
            content
        );
    }

    #[test]
    fn sets_height_bumps_content_and_invalidates_local_bounds() {
        let text = create_text_label(None);
        let content = get_node_local_content_revision(&*text.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*text.read().unwrap());
        set_text_label_height(&text, 250.0);
        assert_eq!(text.read().unwrap().data.height, 250.0);
        assert_eq!(
            get_node_local_content_revision(&*text.read().unwrap()),
            content + 1
        );
        assert_ne!(
            get_node_local_bounds_revision(&*text.read().unwrap()),
            bounds
        );
    }
}

mod set_text_label_string {
    use super::*;

    #[test]
    fn also_invalidates_bounds_under_auto_size() {
        let mut data = text_label_options();
        data.auto_size = Some(TextAutoSize::Left);
        let text = create_label_with_data(data);
        let bounds = get_node_local_bounds_revision(&*text.read().unwrap());
        set_text_label_string(&text, "hello");
        assert_ne!(
            get_node_local_bounds_revision(&*text.read().unwrap()),
            bounds
        );
    }

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let mut data = text_label_options();
        data.text = Some("same".to_string());
        let text = create_label_with_data(data);
        let content = get_node_local_content_revision(&*text.read().unwrap());
        set_text_label_string(&text, "same");
        assert_eq!(
            get_node_local_content_revision(&*text.read().unwrap()),
            content
        );
    }

    #[test]
    fn sets_text_and_bumps_content_without_touching_bounds_under_none() {
        let text = create_text_label(None);
        let content = get_node_local_content_revision(&*text.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*text.read().unwrap());
        set_text_label_string(&text, "hello");
        assert_eq!(text.read().unwrap().data.text, "hello");
        assert_eq!(
            get_node_local_content_revision(&*text.read().unwrap()),
            content + 1
        );
        assert_eq!(
            get_node_local_bounds_revision(&*text.read().unwrap()),
            bounds
        );
    }
}

mod set_text_label_vertical_align {
    use super::*;

    #[test]
    fn defaults_to_top() {
        assert_eq!(
            create_text_label(None).read().unwrap().data.vertical_align,
            TextVerticalAlign::Top
        );
    }

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let mut data = text_label_options();
        data.vertical_align = Some(TextVerticalAlign::Bottom);
        let text = create_label_with_data(data);
        let content = get_node_local_content_revision(&*text.read().unwrap());
        set_text_label_vertical_align(&text, TextVerticalAlign::Bottom);
        assert_eq!(
            get_node_local_content_revision(&*text.read().unwrap()),
            content
        );
    }

    #[test]
    fn sets_the_value_and_bumps_content_without_touching_bounds() {
        let text = create_text_label(None);
        let content = get_node_local_content_revision(&*text.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*text.read().unwrap());
        set_text_label_vertical_align(&text, TextVerticalAlign::Middle);
        assert_eq!(
            text.read().unwrap().data.vertical_align,
            TextVerticalAlign::Middle
        );
        assert_eq!(
            get_node_local_content_revision(&*text.read().unwrap()),
            content + 1
        );
        assert_eq!(
            get_node_local_bounds_revision(&*text.read().unwrap()),
            bounds
        );
    }
}

mod set_text_label_width {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let text = create_text_label(None);
        let content = get_node_local_content_revision(&*text.read().unwrap());
        let width = text.read().unwrap().data.width;
        set_text_label_width(&text, width);
        assert_eq!(
            get_node_local_content_revision(&*text.read().unwrap()),
            content
        );
    }

    #[test]
    fn sets_width_bumps_content_and_invalidates_local_bounds() {
        let text = create_text_label(None);
        let content = get_node_local_content_revision(&*text.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*text.read().unwrap());
        set_text_label_width(&text, 300.0);
        assert_eq!(text.read().unwrap().data.width, 300.0);
        assert_eq!(
            get_node_local_content_revision(&*text.read().unwrap()),
            content + 1
        );
        assert_ne!(
            get_node_local_bounds_revision(&*text.read().unwrap()),
            bounds
        );
    }
}
