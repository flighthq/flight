//! Host-element views (TS `htmlView.ts`). The element is an opaque host value; scene2d only sizes
//! the node.

use std::sync::Arc;

use flight_entity::{Ref, allocate_entity};
use flight_geometry::Rectangle;
use flight_node::{Node, NodeRef, invalidate_node_local_bounds};

use crate::display_object::{create_node2d, create_node2d_runtime, get_node2d_runtime};
use crate::types::*;

/// Allocates an html view (TS `createHtmlView`).
pub fn create_html_view(obj: Option<&PartialHtmlView>) -> Ref<HtmlView> {
    let mut out: HtmlView = create_node2d(
        HTML_VIEW_KIND.to_string(),
        obj.map(|obj| &obj.node),
        Some(create_html_view_runtime),
    );
    out.data = create_html_view_data(obj.and_then(|obj| obj.data.as_ref()));
    return crate::display_object::publish_node2d(out);
}

/// Allocates html view kind data (TS `createHtmlViewData`).
pub fn create_html_view_data(data: Option<&HtmlViewDataOptions>) -> HtmlViewData {
    let mut out: HtmlViewData = allocate_entity();
    initialize_html_view_data(&mut out, data);
    return out;
}

/// The html view's runtime tier with the data-sized bounds computation (TS
/// `createHtmlViewRuntime`).
pub fn create_html_view_runtime() -> HtmlViewRuntime {
    let methods = Node2DRuntimeMethods {
        compute_local_bounds_rectangle: Some(Arc::new(compute_html_view_local_bounds_rectangle)),
        is_local_bounds_rectangle_valid: None,
    };
    return create_node2d_runtime(Some(&methods));
}

/// The construction initializer of `create_html_view_data` (TS `initializeHtmlViewData`).
pub fn initialize_html_view_data(out: &mut HtmlViewData, data: Option<&HtmlViewDataOptions>) {
    out.element = data.and_then(|data| data.element.clone());
    out.height = data.and_then(|data| data.height).unwrap_or(100.0);
    out.width = data.and_then(|data| data.width).unwrap_or(100.0);
}

/// Sizes the local bounds from the view's data width and height (TS
/// `computeHtmlViewLocalBoundsRectangle`).
pub fn compute_html_view_local_bounds_rectangle(out: &mut Rectangle, source: &dyn Node) {
    let Some(view) = source.as_any().downcast_ref::<HtmlView>() else {
        return;
    };
    out.width = view.data.width as f32;
    out.height = view.data.height as f32;
}

/// The html view's runtime tier (TS `getHtmlViewRuntime`).
pub fn get_html_view_runtime(source: &HtmlView) -> &HtmlViewRuntime {
    return get_node2d_runtime(source);
}

/// Resizes the view and invalidates its local bounds; a no-op when the size is unchanged (TS
/// `setHtmlViewSize`).
// flight-lint: allow(f64) D1: the element size is a JS number compared exactly
pub fn set_html_view_size(source: &Ref<HtmlView>, width: f64, height: f64) {
    {
        let mut view = source.write().unwrap();
        if view.data.width == width && view.data.height == height {
            return;
        }
        view.data.width = width;
        view.data.height = height;
    }
    let node: NodeRef = source.clone();
    invalidate_node_local_bounds(&node);
}
