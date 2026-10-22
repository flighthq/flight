use std::sync::Arc;

use flight_geometry::create_rectangle;
use flight_host::NativeViewHandle;
use flight_node::{NodeRef, get_node_local_bounds_rectangle, get_node_local_bounds_revision};
use flight_scene2d::contract::*;

fn view_with(
    width: f64,
    height: f64,
    element: Option<NativeViewHandle>,
) -> flight_entity::Ref<HtmlView> {
    let make: fn() -> PartialHtmlView = PartialHtmlView::default;
    let obj = PartialHtmlView {
        data: Some(HtmlViewDataOptions {
            element,
            height: Some(height),
            width: Some(width),
        }),
        ..make()
    };
    return create_html_view(Some(&obj));
}

fn element() -> NativeViewHandle {
    return NativeViewHandle {
        provider: Arc::new(()),
        handle: Arc::new(String::from("img")),
    };
}

mod compute_html_view_local_bounds_rectangle {
    use super::*;

    #[test]
    fn sets_out_dimensions_from_data_width_and_height() {
        let view = view_with(320.0, 240.0, None);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_html_view_local_bounds_rectangle(&mut out, &*view.read().unwrap());
        assert_eq!((out.width, out.height), (320.0, 240.0));
    }
}

mod create_html_view {
    use super::*;

    #[test]
    fn initializes_default_values() {
        let view = create_html_view(None);
        let view = view.read().unwrap();
        assert!(view.data.element.is_none());
        assert_eq!((view.data.width, view.data.height), (100.0, 100.0));
        assert_eq!(view.kind, HTML_VIEW_KIND);
    }

    #[test]
    fn allows_pre_defined_values() {
        let host = element();
        let view = view_with(640.0, 480.0, Some(host.clone()));
        let view = view.read().unwrap();
        assert!(Arc::ptr_eq(
            &view.data.element.as_ref().unwrap().handle,
            &host.handle
        ));
        assert_eq!((view.data.width, view.data.height), (640.0, 480.0));
    }

    #[test]
    fn returns_a_new_object_each_call() {
        assert!(!Arc::ptr_eq(
            &create_html_view(None),
            &create_html_view(None)
        ));
    }

    #[test]
    fn its_local_bounds_follow_the_data_size() {
        let node: NodeRef = view_with(30.0, 20.0, None);
        let bounds = get_node_local_bounds_rectangle(&node);
        assert_eq!((bounds.width, bounds.height), (30.0, 20.0));
    }
}

mod create_html_view_data {
    use super::*;

    #[test]
    fn returns_default_values() {
        let data = create_html_view_data(None);
        assert!(data.element.is_none());
        assert_eq!((data.width, data.height), (100.0, 100.0));
    }

    #[test]
    fn allows_pre_defined_values() {
        let host = element();
        let data = create_html_view_data(Some(&HtmlViewDataOptions {
            element: Some(host.clone()),
            width: Some(200.0),
            height: Some(150.0),
        }));
        assert!(Arc::ptr_eq(
            &data.element.as_ref().unwrap().handle,
            &host.handle
        ));
        assert_eq!((data.width, data.height), (200.0, 150.0));
    }
}

mod create_html_view_runtime {
    use super::*;

    #[test]
    fn uses_compute_html_view_local_bounds_rectangle() {
        let runtime = create_html_view_runtime();
        let view = view_with(11.0, 22.0, None);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        (runtime.bounds.compute_local_bounds_rectangle)(&mut out, &*view.read().unwrap());
        assert_eq!((out.width, out.height), (11.0, 22.0));
        assert!(runtime.bounds.is_local_bounds_rectangle_valid.is_none());
    }
}

mod get_html_view_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_for_an_html_view() {
        let view = create_html_view(None);
        let guard = view.read().unwrap();
        assert!(std::ptr::eq(
            get_html_view_runtime(&guard),
            get_node2d_runtime(&*guard)
        ));
    }
}

mod initialize_html_view_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_html_view_data() {
        let mut data = create_html_view_data(Some(&HtmlViewDataOptions {
            element: Some(element()),
            width: Some(1.0),
            height: Some(2.0),
        }));
        initialize_html_view_data(&mut data, None);
        assert!(data.element.is_none());
        assert_eq!((data.width, data.height), (100.0, 100.0));
    }
}

mod set_html_view_size {
    use super::*;

    #[test]
    fn updates_width_and_height_and_invalidates_local_bounds() {
        let view = create_html_view(None);
        let node: NodeRef = view.clone();
        let before = get_node_local_bounds_revision(&*node.read().unwrap());
        set_html_view_size(&view, 320.0, 240.0);
        assert_eq!(
            (
                view.read().unwrap().data.width,
                view.read().unwrap().data.height
            ),
            (320.0, 240.0)
        );
        assert_ne!(
            get_node_local_bounds_revision(&*node.read().unwrap()),
            before
        );
        let bounds = get_node_local_bounds_rectangle(&node);
        assert_eq!((bounds.width, bounds.height), (320.0, 240.0));
    }

    #[test]
    fn is_a_no_op_when_dimensions_are_unchanged() {
        let view = view_with(200.0, 150.0, None);
        let node: NodeRef = view.clone();
        let before = get_node_local_bounds_revision(&*node.read().unwrap());
        set_html_view_size(&view, 200.0, 150.0);
        assert_eq!(
            (
                view.read().unwrap().data.width,
                view.read().unwrap().data.height
            ),
            (200.0, 150.0)
        );
        assert_eq!(
            get_node_local_bounds_revision(&*node.read().unwrap()),
            before
        );
    }
}
