use std::sync::Arc;

use flight_geometry::create_rectangle;
use flight_node::{Node, get_node_local_bounds_revision, get_node_local_content_revision};
use flight_scene2d::get_node2d_runtime;
use flight_textlayout::{TextAutoSize, TextVerticalAlign};

use super::*;

fn create_native_with_data(data: TestNativeTextData) -> flight_entity::Ref<NativeText> {
    return create_test_native_text(Some(&data));
}

mod compute_native_text_local_bounds_rectangle {
    use super::*;

    #[test]
    fn falls_back_to_the_fixed_box_under_auto_size_until_measured() {
        let mut data = native_text_options();
        data.auto_size = Some(TextAutoSize::Left);
        data.width = Some(200.0);
        data.height = Some(50.0);
        let native = create_native_with_data(data);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_native_text_local_bounds_rectangle(&mut out, &*native.read().unwrap());
        assert_eq!(out.width, 200.0);
        assert_eq!(out.height, 50.0);
    }

    #[test]
    fn sets_out_dimensions_from_data_when_auto_size_is_none() {
        let mut data = native_text_options();
        data.width = Some(200.0);
        data.height = Some(50.0);
        let native = create_native_with_data(data);
        let mut out = create_rectangle(7.0, 9.0, 0.0, 0.0);
        compute_native_text_local_bounds_rectangle(&mut out, &*native.read().unwrap());
        assert_eq!(out.x, 0.0);
        assert_eq!(out.width, 200.0);
        assert_eq!(out.height, 50.0);
    }

    #[test]
    fn uses_the_measured_size_the_renderer_wrote_back_under_auto_size() {
        let mut data = native_text_options();
        data.auto_size = Some(TextAutoSize::Left);
        data.width = Some(200.0);
        data.height = Some(50.0);
        let native = create_native_with_data(data);
        let runtime = get_native_text_runtime(&*native.read().unwrap());
        runtime.write().unwrap().measured_width = 80.0;
        runtime.write().unwrap().measured_height = 24.0;
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_native_text_local_bounds_rectangle(&mut out, &*native.read().unwrap());
        assert_eq!(out.width, 80.0);
        assert_eq!(out.height, 24.0);
    }
}

mod create_native_text {
    use super::*;

    #[test]
    fn allows_pre_defined_values() {
        let mut data = native_text_options();
        data.auto_size = Some(TextAutoSize::Left);
        data.text = Some("foo".to_string());
        data.width = Some(300.0);
        data.height = Some(40.0);
        let native = create_native_with_data(data);
        let native = native.read().unwrap();
        assert_eq!(native.data.auto_size, TextAutoSize::Left);
        assert_eq!(native.data.text, "foo");
        assert_eq!(native.data.width, 300.0);
        assert_eq!(native.data.height, 40.0);
    }

    #[test]
    fn initializes_default_values() {
        let native = create_native_text();
        let native = native.read().unwrap();
        assert_eq!(native.data.text, "");
        assert_eq!(native.data.auto_size, TextAutoSize::None);
        assert_eq!(native.data.width, 100.0);
        assert_eq!(native.data.height, 100.0);
        assert_eq!(native.node_fields().kind, NATIVE_TEXT_KIND);
    }
}

mod create_native_text_data {
    use super::*;

    // D23 B: the source's pre-defined values are assigned after the zero-field create.
    #[test]
    fn allows_pre_defined_values() {
        let mut data = create_native_text_data();
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
        let data = create_native_text_data();
        assert_eq!(data.auto_size, TextAutoSize::None);
        assert_eq!(data.height, 100.0);
        assert_eq!(data.text, "");
        assert_eq!(data.vertical_align, TextVerticalAlign::Top);
        assert_eq!(data.width, 100.0);
    }
}

mod create_native_text_runtime {
    use super::*;

    #[test]
    fn returns_empty_platform_slots() {
        let runtime = create_native_text_runtime();
        assert!(runtime.element.is_none());
        assert_eq!(runtime.measured_width, 0.0);
        assert_eq!(runtime.measured_height, 0.0);
    }

    #[test]
    fn uses_compute_native_text_local_bounds_rectangle() {
        create_native_text_runtime();
        let native = create_native_text();
        let native_read = native.read().unwrap();
        let callback = get_node2d_runtime(&*native_read)
            .bounds
            .compute_local_bounds_rectangle
            .clone();
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        callback(&mut out, &*native_read);
        assert_eq!(out.width, 100.0);
    }
}

mod get_native_text_measured_height {
    use super::*;

    #[test]
    fn returns_the_value_the_renderer_wrote_back() {
        let native = create_native_text();
        let runtime = get_native_text_runtime(&*native.read().unwrap());
        runtime.write().unwrap().measured_height = 24.0;
        assert_eq!(
            get_native_text_measured_height(&*native.read().unwrap()),
            24.0
        );
    }

    #[test]
    fn returns_zero_before_the_renderer_writes_a_measurement() {
        let native = create_native_text();
        assert_eq!(
            get_native_text_measured_height(&*native.read().unwrap()),
            0.0
        );
    }
}

mod get_native_text_measured_width {
    use super::*;

    #[test]
    fn returns_the_value_the_renderer_wrote_back() {
        let native = create_native_text();
        let runtime = get_native_text_runtime(&*native.read().unwrap());
        runtime.write().unwrap().measured_width = 80.0;
        assert_eq!(
            get_native_text_measured_width(&*native.read().unwrap()),
            80.0
        );
    }

    #[test]
    fn returns_zero_before_the_renderer_writes_a_measurement() {
        let native = create_native_text();
        assert_eq!(
            get_native_text_measured_width(&*native.read().unwrap()),
            0.0
        );
    }
}

mod get_native_text_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_for_a_native_text() {
        let native = create_native_text();
        let first = get_native_text_runtime(&*native.read().unwrap());
        let second = get_native_text_runtime(&*native.read().unwrap());
        assert!(Arc::ptr_eq(&first, &second));
    }
}

mod get_native_text_string {
    use super::*;

    #[test]
    fn returns_the_text_field() {
        let mut data = native_text_options();
        data.text = Some("hello".to_string());
        let native = create_native_with_data(data);
        assert_eq!(get_native_text_string(&*native.read().unwrap()), "hello");
    }
}

mod get_native_text_style {
    use super::*;

    #[test]
    fn returns_the_style_field() {
        let mut style = native_text_style();
        style.size = Some(16.0);
        style.bold = Some(true);
        let style = Arc::new(std::sync::RwLock::new(style));
        let mut data = native_text_options();
        data.style = Some(style.clone());
        let native = create_native_with_data(data);
        assert!(Arc::ptr_eq(
            &get_native_text_style(&*native.read().unwrap()),
            &style
        ));
    }
}

mod initialize_native_text {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_native_text() {
        let native = create_native_text();
        let mut native = native.write().unwrap();
        flight_entity::set_entity_uid(&mut *native, "native".to_string());
        native.data.text = "stale".to_string();
        initialize_native_text(&mut native);
        assert_eq!(flight_entity::get_entity_uid(&mut *native), "native");
        assert_eq!(native.data.text, "");
        assert_eq!(native.data.height, 100.0);
    }
}

mod initialize_native_text_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_native_text_data() {
        let mut data = create_native_text_data();
        data.text = "stale".to_string();
        data.width = 7.0;
        initialize_native_text_data(&mut data);
        assert_eq!(data.text, "");
        assert_eq!(data.width, 100.0);
        assert_eq!(data.auto_size, TextAutoSize::None);
    }
}

mod patch_native_text_style {
    use super::*;

    #[test]
    fn bumps_content_after_patching() {
        let native = create_native_text();
        let content = get_node_local_content_revision(&*native.read().unwrap());
        let mut patch = native_text_style();
        patch.size = Some(20.0);
        patch_native_text_style(&native, &patch);
        assert_eq!(
            get_node_local_content_revision(&*native.read().unwrap()),
            content + 1
        );
    }

    #[test]
    fn merges_the_patch_into_the_existing_style() {
        let mut style = native_text_style();
        style.size = Some(14.0);
        style.bold = Some(false);
        let mut data = native_text_options();
        data.style = Some(Arc::new(std::sync::RwLock::new(style)));
        let native = create_native_with_data(data);
        let mut patch = native_text_style();
        patch.bold = Some(true);
        patch.color = Some(0xff00_00ff);
        patch_native_text_style(&native, &patch);
        let style = get_native_text_style(&*native.read().unwrap());
        let style = style.read().unwrap();
        assert_eq!(style.size, Some(14.0));
        assert_eq!(style.bold, Some(true));
        assert_eq!(style.color, Some(0xff00_00ff));
    }
}

mod set_native_text_auto_size {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let native = create_native_text();
        let content = get_node_local_content_revision(&*native.read().unwrap());
        set_native_text_auto_size(&native, TextAutoSize::None);
        assert_eq!(
            get_node_local_content_revision(&*native.read().unwrap()),
            content
        );
    }

    #[test]
    fn sets_auto_size_bumps_content_and_invalidates_local_bounds() {
        let native = create_native_text();
        let content = get_node_local_content_revision(&*native.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*native.read().unwrap());
        set_native_text_auto_size(&native, TextAutoSize::Left);
        assert_eq!(native.read().unwrap().data.auto_size, TextAutoSize::Left);
        assert_eq!(
            get_node_local_content_revision(&*native.read().unwrap()),
            content + 1
        );
        assert_ne!(
            get_node_local_bounds_revision(&*native.read().unwrap()),
            bounds
        );
    }
}

mod set_native_text_height {
    use super::*;

    #[test]
    fn sets_height_bumps_content_and_invalidates_local_bounds() {
        let native = create_native_text();
        let content = get_node_local_content_revision(&*native.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*native.read().unwrap());
        set_native_text_height(&native, 250.0);
        assert_eq!(native.read().unwrap().data.height, 250.0);
        assert_eq!(
            get_node_local_content_revision(&*native.read().unwrap()),
            content + 1
        );
        assert_ne!(
            get_node_local_bounds_revision(&*native.read().unwrap()),
            bounds
        );
    }
}

mod set_native_text_string {
    use super::*;

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let mut data = native_text_options();
        data.text = Some("same".to_string());
        let native = create_native_with_data(data);
        let content = get_node_local_content_revision(&*native.read().unwrap());
        set_native_text_string(&native, "same");
        assert_eq!(
            get_node_local_content_revision(&*native.read().unwrap()),
            content
        );
    }

    #[test]
    fn sets_text_and_bumps_content() {
        let native = create_native_text();
        let content = get_node_local_content_revision(&*native.read().unwrap());
        set_native_text_string(&native, "hello");
        assert_eq!(native.read().unwrap().data.text, "hello");
        assert_eq!(
            get_node_local_content_revision(&*native.read().unwrap()),
            content + 1
        );
    }
}

mod set_native_text_style {
    use super::*;

    #[test]
    fn replaces_the_style_and_bumps_content() {
        let native = create_native_text();
        let content = get_node_local_content_revision(&*native.read().unwrap());
        let mut style = native_text_style();
        style.size = Some(24.0);
        let style = Arc::new(std::sync::RwLock::new(style));
        set_native_text_style(&native, style.clone());
        assert!(Arc::ptr_eq(&native.read().unwrap().data.style, &style));
        assert_eq!(
            get_node_local_content_revision(&*native.read().unwrap()),
            content + 1
        );
    }
}

mod set_native_text_vertical_align {
    use super::*;

    #[test]
    fn defaults_to_top() {
        assert_eq!(
            create_native_text().read().unwrap().data.vertical_align,
            TextVerticalAlign::Top
        );
    }

    #[test]
    fn does_not_bump_content_when_the_value_is_unchanged() {
        let mut data = native_text_options();
        data.vertical_align = Some(TextVerticalAlign::Bottom);
        let native = create_native_with_data(data);
        let content = get_node_local_content_revision(&*native.read().unwrap());
        set_native_text_vertical_align(&native, TextVerticalAlign::Bottom);
        assert_eq!(
            get_node_local_content_revision(&*native.read().unwrap()),
            content
        );
    }

    #[test]
    fn sets_the_value_and_bumps_content_without_touching_bounds() {
        let native = create_native_text();
        let content = get_node_local_content_revision(&*native.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*native.read().unwrap());
        set_native_text_vertical_align(&native, TextVerticalAlign::Middle);
        assert_eq!(
            native.read().unwrap().data.vertical_align,
            TextVerticalAlign::Middle
        );
        assert_eq!(
            get_node_local_content_revision(&*native.read().unwrap()),
            content + 1
        );
        assert_eq!(
            get_node_local_bounds_revision(&*native.read().unwrap()),
            bounds
        );
    }
}

mod set_native_text_width {
    use super::*;

    #[test]
    fn sets_width_bumps_content_and_invalidates_local_bounds() {
        let native = create_native_text();
        let content = get_node_local_content_revision(&*native.read().unwrap());
        let bounds = get_node_local_bounds_revision(&*native.read().unwrap());
        set_native_text_width(&native, 300.0);
        assert_eq!(native.read().unwrap().data.width, 300.0);
        assert_eq!(
            get_node_local_content_revision(&*native.read().unwrap()),
            content + 1
        );
        assert_ne!(
            get_node_local_bounds_revision(&*native.read().unwrap()),
            bounds
        );
    }
}
