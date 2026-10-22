use flight_geometry::{Matrix, Rectangle, inverse_matrix, multiply_matrix};
use flight_node::{NodeRef, get_node_local_matrix};

use crate::{
    RenderTargetAxes, RenderTargetAxis, RenderTargetAxisDifference, RenderTargetAxisValue,
    RenderTargetDepth, RenderTargetDescriptor, RenderTargetFormat, RenderTargetPadding,
    RenderTargetSize, ResolvedRenderTargetDescriptor,
};

pub fn compute_render_cache_transform(
    out_cache_transform: &mut Matrix,
    bounds: &Rectangle,
    content_x: Option<f32>,
    content_y: Option<f32>,
) {
    out_cache_transform.a = 1.0;
    out_cache_transform.b = 0.0;
    out_cache_transform.c = 0.0;
    out_cache_transform.d = 1.0;
    out_cache_transform.tx = bounds.x - content_x.unwrap_or(0.0);
    out_cache_transform.ty = bounds.y - content_y.unwrap_or(0.0);
}

pub fn compute_render_target_size<'a>(
    out: &'a mut RenderTargetSize,
    bounds: &Rectangle,
    padding: Option<RenderTargetPadding>,
    min_width: Option<f32>,
    min_height: Option<f32>,
) -> &'a mut RenderTargetSize {
    let (horizontal, vertical) = match padding.unwrap_or(RenderTargetPadding::Uniform(0.0)) {
        RenderTargetPadding::Uniform(value) => (value * 2.0, value * 2.0),
        RenderTargetPadding::Edges(value) => (value.left + value.right, value.top + value.bottom),
    };
    out.width = min_width
        .unwrap_or(1.0)
        .max(bounds.width.ceil() + horizontal);
    out.height = min_height
        .unwrap_or(1.0)
        .max(bounds.height.ceil() + vertical);
    return out;
}

pub fn compute_scene_2d_render_target_transform(
    out_render_transform: &mut Matrix,
    source: &NodeRef,
    bounds: &Rectangle,
    content_x: Option<f32>,
    content_y: Option<f32>,
) {
    let local_transform = get_node_local_matrix(source);
    let mut inverse = flight_geometry::create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    inverse_matrix(&mut inverse, &local_transform);
    let translation = flight_geometry::create_matrix(
        1.0,
        0.0,
        0.0,
        1.0,
        content_x.unwrap_or(0.0) - bounds.x,
        content_y.unwrap_or(0.0) - bounds.y,
    );
    multiply_matrix(out_render_transform, &translation, &inverse);
}

pub fn explain_render_target_axes(
    requested: &RenderTargetAxes,
    effective: &RenderTargetAxes,
) -> Vec<RenderTargetAxisDifference> {
    let mut out = Vec::new();
    push_difference(
        &mut out,
        RenderTargetAxis::Width,
        RenderTargetAxisValue::Count(requested.width),
        RenderTargetAxisValue::Count(effective.width),
    );
    push_difference(
        &mut out,
        RenderTargetAxis::Height,
        RenderTargetAxisValue::Count(requested.height),
        RenderTargetAxisValue::Count(effective.height),
    );
    push_difference(
        &mut out,
        RenderTargetAxis::Format,
        RenderTargetAxisValue::Format(requested.format),
        RenderTargetAxisValue::Format(effective.format),
    );
    push_difference(
        &mut out,
        RenderTargetAxis::ColorAttachments,
        RenderTargetAxisValue::Count(requested.color_attachments),
        RenderTargetAxisValue::Count(effective.color_attachments),
    );
    push_difference(
        &mut out,
        RenderTargetAxis::ColorFormats,
        RenderTargetAxisValue::Formats(requested.color_formats.clone()),
        RenderTargetAxisValue::Formats(effective.color_formats.clone()),
    );
    push_difference(
        &mut out,
        RenderTargetAxis::SampleCount,
        RenderTargetAxisValue::Count(requested.sample_count),
        RenderTargetAxisValue::Count(effective.sample_count),
    );
    push_difference(
        &mut out,
        RenderTargetAxis::Depth,
        RenderTargetAxisValue::Depth(requested.depth),
        RenderTargetAxisValue::Depth(effective.depth),
    );
    push_difference(
        &mut out,
        RenderTargetAxis::ColorSpace,
        RenderTargetAxisValue::ColorSpace(requested.color_space),
        RenderTargetAxisValue::ColorSpace(effective.color_space),
    );
    return out;
}

fn push_difference(
    out: &mut Vec<RenderTargetAxisDifference>,
    axis: RenderTargetAxis,
    requested: RenderTargetAxisValue,
    effective: RenderTargetAxisValue,
) {
    if requested != effective {
        out.push(RenderTargetAxisDifference {
            axis,
            effective,
            requested,
        });
    }
}

pub fn resolve_render_target_descriptor(
    descriptor: &RenderTargetDescriptor,
) -> ResolvedRenderTargetDescriptor {
    let width = descriptor.width.ceil().max(1.0) as u32;
    let height = descriptor.height.ceil().max(1.0) as u32;
    let color_attachments = descriptor.color_attachments.unwrap_or(1.0).ceil().max(1.0) as u32;
    let default_format = descriptor.format.unwrap_or(RenderTargetFormat::Rgba8);
    let mut color_formats = Vec::with_capacity(color_attachments as usize);
    for index in 0..color_attachments as usize {
        color_formats.push(
            descriptor
                .color_formats
                .as_ref()
                .and_then(|formats| formats.get(index))
                .copied()
                .unwrap_or(default_format),
        );
    }
    return RenderTargetAxes {
        width,
        height,
        format: color_formats[0],
        color_attachments,
        color_formats,
        sample_count: descriptor.sample_count.unwrap_or(1.0).ceil().max(1.0) as u32,
        depth: descriptor.depth.unwrap_or(RenderTargetDepth::None),
        color_space: descriptor.color_space.unwrap_or_default(),
    };
}
