use flight_geometry::{Matrix, Rectangle, create_rectangle, matrix_transform_rectangle};
use flight_node::contract::NodeRevisionState;
use flight_node::{NodeRef, Viewport, get_node_world_bounds_rectangle};

use crate::{RenderProxy2D, RenderState};

// flight-lint: allow(conform-params) D5 caller-owned node revision state replaces hidden revision state
pub fn compute_render_proxy_world_bounds(
    out: &mut Rectangle,
    source: &NodeRef,
    revisions: &mut NodeRevisionState,
) {
    let bounds = get_node_world_bounds_rectangle(source, revisions);
    out.x = bounds.x;
    out.y = bounds.y;
    out.width = bounds.width;
    out.height = bounds.height;
}

// flight-lint: allow(conform-params) D5 caller-owned node revision state replaces hidden revision state
pub fn is_render_proxy_in_viewport<S: RenderState>(
    proxy: &RenderProxy2D<S>,
    viewport: &Viewport,
    render_transform_2d: Option<&Matrix>,
    revisions: &mut NodeRevisionState,
) -> bool {
    return is_renderable_in_viewport(&proxy.source, viewport, render_transform_2d, revisions);
}

// flight-lint: allow(conform-params) D5 caller-owned node revision state replaces hidden revision state
pub fn is_renderable_in_viewport(
    source: &NodeRef,
    viewport: &Viewport,
    render_transform_2d: Option<&Matrix>,
    revisions: &mut NodeRevisionState,
) -> bool {
    let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
    compute_render_proxy_world_bounds(&mut bounds, source, revisions);
    let transformed;
    let bounds = match render_transform_2d {
        Some(transform) => {
            transformed = {
                let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
                matrix_transform_rectangle(&mut out, transform, &bounds);
                out
            };
            &transformed
        }
        None => &bounds,
    };
    let object_max_x = bounds.x + bounds.width;
    let object_max_y = bounds.y + bounds.height;
    let viewport_max_x = viewport.x + viewport.width;
    let viewport_max_y = viewport.y + viewport.height;
    return !(object_max_x < viewport.x
        || bounds.x > viewport_max_x
        || object_max_y < viewport.y
        || bounds.y > viewport_max_y);
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
