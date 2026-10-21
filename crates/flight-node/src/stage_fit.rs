//! Scene2D scale-and-align fit math over a structural fit context (TS `stageFit.ts`).

// flight-lint: allow-file(contract-vocabulary) the structural fit context is the node-owned Viewport/Scene2DFitContext contract, not a foreign family

use flight_geometry::{Matrix, Rectangle, create_rectangle};

use crate::types::*;

/// Horizontal alignment offset of scaled content within the view (TS `computeScene2DFitAlignX`).
pub fn compute_scene2d_fit_align_x(
    scaled_content_width: f32,
    view_width: f32,
    align: ViewportAlign,
) -> f32 {
    match align {
        ViewportAlign::Left | ViewportAlign::TopLeft | ViewportAlign::BottomLeft => return 0.0,
        ViewportAlign::Right | ViewportAlign::TopRight | ViewportAlign::BottomRight => {
            return view_width - scaled_content_width;
        }
        ViewportAlign::Top | ViewportAlign::Bottom => {
            return (view_width - scaled_content_width) / 2.0;
        }
    }
}

/// Vertical alignment offset of scaled content within the view (TS `computeScene2DFitAlignY`).
pub fn compute_scene2d_fit_align_y(
    scaled_content_height: f32,
    view_height: f32,
    align: ViewportAlign,
) -> f32 {
    match align {
        ViewportAlign::Top | ViewportAlign::TopLeft | ViewportAlign::TopRight => return 0.0,
        ViewportAlign::Bottom | ViewportAlign::BottomLeft | ViewportAlign::BottomRight => {
            return view_height - scaled_content_height;
        }
        ViewportAlign::Left | ViewportAlign::Right => {
            return (view_height - scaled_content_height) / 2.0;
        }
    }
}

/// Uniform scale that fills the view, cropping overflow (TS `computeScene2DFitFillScale`).
pub fn compute_scene2d_fit_fill_scale(
    content_width: f32,
    content_height: f32,
    view_width: f32,
    view_height: f32,
) -> f32 {
    return (view_width / content_width).max(view_height / content_height);
}

/// Uniform scale that fits the content inside the view (TS `computeScene2DFitScale`).
pub fn compute_scene2d_fit_scale(
    content_width: f32,
    content_height: f32,
    view_width: f32,
    view_height: f32,
) -> f32 {
    return (view_width / content_width).min(view_height / content_height);
}

/// Writes the scale-and-align matrix mapping scene2d root content into a view (TS
/// `computeScene2DFitTransform`). An empty or unmeasurable root yields identity.
pub fn compute_scene2d_fit_transform(
    out: &mut Matrix,
    scene2d: &Scene2DFitContext,
    view_width: f32,
    view_height: f32,
) {
    let mut content_x = 0.0;
    let mut content_y = 0.0;
    let mut content_width = 0.0;
    let mut content_height = 0.0;
    if let Some(root) = &scene2d.root {
        let compute = {
            let guard = root.read().unwrap();
            guard.as_bounds_node().map(|bounds| {
                bounds
                    .bounds_runtime()
                    .compute_local_bounds_rectangle
                    .clone()
            })
        };
        if let Some(compute) = compute {
            let mut rectangle: Rectangle = create_rectangle(0.0, 0.0, 0.0, 0.0);
            {
                let guard = root.read().unwrap();
                compute(&mut rectangle, &*guard);
            }
            content_x = rectangle.x;
            content_y = rectangle.y;
            content_width = rectangle.width;
            content_height = rectangle.height;
        }
    }
    if content_width == 0.0 || content_height == 0.0 {
        out.a = 1.0;
        out.b = 0.0;
        out.c = 0.0;
        out.d = 1.0;
        out.tx = 0.0;
        out.ty = 0.0;
        return;
    }
    let (scale_x, scale_y) = match scene2d.scale_mode {
        ViewportScaleMode::NoScale => (1.0, 1.0),
        ViewportScaleMode::ExactFit => (view_width / content_width, view_height / content_height),
        ViewportScaleMode::ShowAll => {
            let scale =
                compute_scene2d_fit_scale(content_width, content_height, view_width, view_height);
            (scale, scale)
        }
        ViewportScaleMode::NoBorder => {
            let scale = compute_scene2d_fit_fill_scale(
                content_width,
                content_height,
                view_width,
                view_height,
            );
            (scale, scale)
        }
    };
    out.a = scale_x;
    out.b = 0.0;
    out.c = 0.0;
    out.d = scale_y;
    out.tx = compute_scene2d_fit_align_x(content_width * scale_x, view_width, scene2d.align)
        - content_x * scale_x;
    out.ty = compute_scene2d_fit_align_y(content_height * scale_y, view_height, scene2d.align)
        - content_y * scale_y;
}
