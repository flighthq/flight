// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use flight_geometry::{Matrix, Rectangle, copy_matrix, copy_rectangle, is_empty_rectangle};
use flight_node::{NodeRef, compute_node_root_local_bounds_rectangle};
use flight_render::{
    EffectPadding, RenderState, RenderTargetPadding, RenderTargetSize, compute_render_target_size,
    compute_scene_2d_render_target_transform,
};

use crate::contract::{EffectRef, compute_effect_padding};

#[derive(Clone, Debug, PartialEq)]
pub struct EffectCaptureGeometry {
    pub bounds: Rectangle,
    pub capture_transform: Matrix,
    pub padding: EffectPadding,
    pub target_height: f32,
    pub target_width: f32,
}

pub fn compute_effect_capture_geometry<S: RenderState>(
    out: &mut EffectCaptureGeometry,
    state: &mut S,
    source: &NodeRef,
    effects: &[EffectRef],
) -> bool {
    let mut bounds = Rectangle::default();
    compute_node_root_local_bounds_rectangle(&mut bounds, source);
    if is_empty_rectangle(&bounds) {
        return false;
    }

    let mut padding = EffectPadding {
        bottom: 0.0,
        left: 0.0,
        right: 0.0,
        top: 0.0,
    };
    compute_effect_padding(&mut padding, state, effects);
    let mut target_size = RenderTargetSize::default();
    compute_render_target_size(
        &mut target_size,
        &bounds,
        Some(RenderTargetPadding::Edges(padding)),
        None,
        None,
    );
    let mut capture_transform = Matrix::default();
    compute_scene_2d_render_target_transform(
        &mut capture_transform,
        source,
        &bounds,
        Some(padding.left),
        Some(padding.top),
    );

    copy_rectangle(&mut out.bounds, &bounds);
    out.padding = padding;
    copy_matrix(&mut out.capture_transform, &capture_transform);
    out.target_height = target_size.height;
    out.target_width = target_size.width;
    return true;
}

impl Default for EffectCaptureGeometry {
    fn default() -> Self {
        return Self {
            bounds: Rectangle::default(),
            capture_transform: Matrix::default(),
            padding: EffectPadding {
                bottom: 0.0,
                left: 0.0,
                right: 0.0,
                top: 0.0,
            },
            target_height: 0.0,
            target_width: 0.0,
        };
    }
}
