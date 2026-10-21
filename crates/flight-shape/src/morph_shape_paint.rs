//! Morph paint bindings sampled alongside path morphs (TS `morphShapePaint.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use std::sync::Arc;

use flight_entity::Ref;
use flight_geometry::{Matrix, clone_matrix, create_matrix};
use flight_texture::contract::Texture;

use crate::explain_morph_shape_gradient_endpoints::get_morph_shape_gradient_endpoint_issue;
use crate::shape_commands::{
    append_shape_begin_fill, append_shape_begin_gradient_fill, append_shape_begin_texture_fill,
    append_shape_line_gradient_style, append_shape_line_style, append_shape_line_texture_style,
};
use crate::types::*;

pub(crate) fn _unused_arc() -> Arc<()> {
    return Arc::new(());
}

/// Appends a `beginFill` backed by a start/end color binding (TS `appendMorphShapeBeginFill`).
pub fn append_morph_shape_begin_fill(
    shape: &Ref<MorphShape>,
    start: &MorphShapeColorEndpoint,
    end: &MorphShapeColorEndpoint,
) {
    let command_index = {
        let guard = shape.read().unwrap();
        guard.data.commands.len()
    };
    append_shape_begin_fill(shape, start.color, Some(start.alpha.unwrap_or(1.0) as f64));
    let binding = MorphShapePaintBinding::Color(MorphShapeColorPaintBinding {
        command_index,
        end_alpha: end.alpha.unwrap_or(1.0),
        end_color: end.color,
        start_alpha: start.alpha.unwrap_or(1.0),
        start_color: start.color,
    });
    {
        let mut guard = shape.write().unwrap();
        guard.data.paint_bindings.push(binding.clone());
        let progress = guard.data.progress;
        sample_paint_binding(&mut guard.data, &binding, progress);
    }
}

/// Appends a `beginGradientFill` when both endpoints are representable (TS
/// `appendMorphShapeBeginGradientFill`).
pub fn append_morph_shape_begin_gradient_fill(
    shape: &Ref<MorphShape>,
    gradient_type: GradientType,
    start: &MorphShapeGradientEndpoint,
    end: &MorphShapeGradientEndpoint,
    spread_method: Option<SpreadMethod>,
    interpolation_method: Option<InterpolationMethod>,
) -> bool {
    return append_morph_shape_gradient_paint(
        shape,
        "beginGradientFill",
        gradient_type,
        start,
        end,
        spread_method.unwrap_or(SpreadMethod::Pad),
        interpolation_method.unwrap_or(InterpolationMethod::Rgb),
    );
}

/// Appends a `beginTextureFill` whose placement matrices morph (TS
/// `appendMorphShapeBeginTextureFill`).
pub fn append_morph_shape_begin_texture_fill(
    shape: &Ref<MorphShape>,
    texture: &Ref<Texture>,
    start_matrix: Option<&Matrix>,
    end_matrix: Option<&Matrix>,
) {
    append_morph_shape_texture_paint(shape, "beginTextureFill", texture, start_matrix, end_matrix);
}

fn append_morph_shape_gradient_paint(
    shape: &Ref<MorphShape>,
    command_key: &str,
    gradient_type: GradientType,
    start: &MorphShapeGradientEndpoint,
    end: &MorphShapeGradientEndpoint,
    spread_method: SpreadMethod,
    interpolation_method: InterpolationMethod,
) -> bool {
    if get_morph_shape_gradient_endpoint_issue(start, end) != 0 {
        return false;
    }
    let command_index = {
        let guard = shape.read().unwrap();
        guard.data.commands.len()
    };
    let start_source = start.matrix.as_ref();
    let end_source = end.matrix.as_ref();
    let has_matrix = start_source.is_some() || end_source.is_some();
    let start_matrix = if has_matrix {
        Some(clone_matrix(start_source.unwrap_or(&identity_matrix())))
    } else {
        None
    };
    let end_matrix = if has_matrix {
        Some(clone_matrix(end_source.unwrap_or(&identity_matrix())))
    } else {
        None
    };
    let current_matrix = match start_matrix.as_ref() {
        Some(matrix) => Some(clone_matrix(matrix)),
        None => None,
    };
    let colors: Vec<u32> = start.colors.clone();
    let alphas = start.alphas.clone();
    let ratios = start.ratios.clone();
    if command_key == "beginGradientFill" {
        append_shape_begin_gradient_fill(
            shape,
            gradient_type,
            &colors,
            &alphas,
            &ratios,
            current_matrix.as_ref(),
            Some(spread_method),
            Some(interpolation_method),
            Some(start.focal_point_ratio.unwrap_or(0.0)),
        );
    } else {
        append_shape_line_gradient_style(
            shape,
            gradient_type,
            &colors,
            &alphas,
            &ratios,
            current_matrix.as_ref(),
            Some(spread_method),
            Some(interpolation_method),
            Some(start.focal_point_ratio.unwrap_or(0.0)),
        );
    }
    let binding = MorphShapePaintBinding::Gradient(MorphShapeGradientPaintBinding {
        command_index,
        command_key: String::from(command_key),
        end_alphas: end.alphas.clone(),
        end_colors: end.colors.clone(),
        end_focal_point_ratio: end.focal_point_ratio.unwrap_or(0.0),
        end_matrix,
        end_ratios: end.ratios.clone(),
        start_alphas: start.alphas.clone(),
        start_colors: start.colors.clone(),
        start_focal_point_ratio: start.focal_point_ratio.unwrap_or(0.0),
        start_matrix,
        start_ratios: start.ratios.clone(),
    });
    {
        let mut guard = shape.write().unwrap();
        guard.data.paint_bindings.push(binding.clone());
        let progress = guard.data.progress;
        sample_paint_binding(&mut guard.data, &binding, progress);
    }
    return true;
}

/// Appends a `lineGradientStyle` when both endpoints are representable (TS
/// `appendMorphShapeLineGradientStyle`).
pub fn append_morph_shape_line_gradient_style(
    shape: &Ref<MorphShape>,
    gradient_type: GradientType,
    start: &MorphShapeGradientEndpoint,
    end: &MorphShapeGradientEndpoint,
    spread_method: Option<SpreadMethod>,
    interpolation_method: Option<InterpolationMethod>,
) -> bool {
    return append_morph_shape_gradient_paint(
        shape,
        "lineGradientStyle",
        gradient_type,
        start,
        end,
        spread_method.unwrap_or(SpreadMethod::Pad),
        interpolation_method.unwrap_or(InterpolationMethod::Rgb),
    );
}

/// Appends a `lineStyle` backed by a start/end line binding (TS `appendMorphShapeLineStyle`).
pub fn append_morph_shape_line_style(
    shape: &Ref<MorphShape>,
    start: &MorphShapeLineEndpoint,
    end: &MorphShapeLineEndpoint,
    pixel_hinting: Option<bool>,
    scale_mode: Option<LineScaleMode>,
    caps: Option<CapsStyle>,
    joints: Option<JointStyle>,
    miter_limit: Option<f64>,
) {
    let command_index = {
        let guard = shape.read().unwrap();
        guard.data.commands.len()
    };
    append_shape_line_style(
        shape,
        Some(start.thickness),
        start.color,
        Some(start.alpha.unwrap_or(1.0) as f64),
        pixel_hinting,
        scale_mode,
        caps,
        joints,
        miter_limit,
    );
    let binding = MorphShapePaintBinding::Line(MorphShapeLinePaintBinding {
        command_index,
        end_alpha: end.alpha.unwrap_or(1.0),
        end_color: end.color,
        end_thickness: end.thickness,
        start_alpha: start.alpha.unwrap_or(1.0),
        start_color: start.color,
        start_thickness: start.thickness,
    });
    {
        let mut guard = shape.write().unwrap();
        guard.data.paint_bindings.push(binding.clone());
        let progress = guard.data.progress;
        sample_paint_binding(&mut guard.data, &binding, progress);
    }
}

/// Appends a `lineTextureStyle` whose placement matrices morph (TS
/// `appendMorphShapeLineTextureStyle`).
pub fn append_morph_shape_line_texture_style(
    shape: &Ref<MorphShape>,
    texture: &Ref<Texture>,
    start_matrix: Option<&Matrix>,
    end_matrix: Option<&Matrix>,
) {
    append_morph_shape_texture_paint(shape, "lineTextureStyle", texture, start_matrix, end_matrix);
}

fn append_morph_shape_texture_paint(
    shape: &Ref<MorphShape>,
    command_key: &str,
    texture: &Ref<Texture>,
    start_source: Option<&Matrix>,
    end_source: Option<&Matrix>,
) {
    if start_source.is_none() && end_source.is_none() {
        if command_key == "beginTextureFill" {
            append_shape_begin_texture_fill(shape, texture, None);
        } else {
            append_shape_line_texture_style(shape, texture, None);
        }
        return;
    }
    let command_index = {
        let guard = shape.read().unwrap();
        guard.data.commands.len()
    };
    let start_matrix = clone_matrix(start_source.unwrap_or(&identity_matrix()));
    let end_matrix = clone_matrix(end_source.unwrap_or(&identity_matrix()));
    let current = clone_matrix(&start_matrix);
    if command_key == "beginTextureFill" {
        append_shape_begin_texture_fill(shape, texture, Some(&current));
    } else {
        append_shape_line_texture_style(shape, texture, Some(&current));
    }
    let binding = MorphShapePaintBinding::Texture(MorphShapeTexturePaintBinding {
        command_index,
        command_key: String::from(command_key),
        end_matrix,
        start_matrix,
    });
    let mut guard = shape.write().unwrap();
    guard.data.paint_bindings.push(binding.clone());
    let progress = guard.data.progress;
    sample_paint_binding(&mut guard.data, &binding, progress);
}

fn identity_matrix() -> Matrix {
    return create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
}

fn interpolate_byte(start: u32, end: u32, progress: f64) -> u32 {
    return interpolate_number(start as f64, end as f64, progress)
        .max(0.0)
        .min(255.0)
        .round() as u32;
}

fn interpolate_number(start: f64, end: f64, progress: f64) -> f64 {
    if progress == 0.0 {
        return start;
    }
    if progress == 1.0 {
        return end;
    }
    return start + (end - start) * progress;
}

fn interpolate_rgba(start: u32, end: u32, progress: f64) -> u32 {
    let r = interpolate_byte((start >> 24) & 0xff, (end >> 24) & 0xff, progress);
    let g = interpolate_byte((start >> 16) & 0xff, (end >> 16) & 0xff, progress);
    let b = interpolate_byte((start >> 8) & 0xff, (end >> 8) & 0xff, progress);
    let a = interpolate_byte(start & 0xff, end & 0xff, progress);
    return (r << 24) | (g << 16) | (b << 8) | a;
}

fn sample_matrix(out: &mut Matrix, start: &Matrix, end: &Matrix, progress: f64) {
    out.a = interpolate_number(start.a as f64, end.a as f64, progress) as f32;
    out.b = interpolate_number(start.b as f64, end.b as f64, progress) as f32;
    out.c = interpolate_number(start.c as f64, end.c as f64, progress) as f32;
    out.d = interpolate_number(start.d as f64, end.d as f64, progress) as f32;
    out.tx = interpolate_number(start.tx as f64, end.tx as f64, progress) as f32;
    out.ty = interpolate_number(start.ty as f64, end.ty as f64, progress) as f32;
}

/// Samples every retained paint binding at `progress` (TS `sampleMorphShapePaintBindings`).
pub fn sample_morph_shape_paint_bindings(data: &mut MorphShapeData, progress: f64) {
    let bindings = data.paint_bindings.clone();
    for binding in &bindings {
        sample_paint_binding(data, binding, progress);
    }
}

/// Samples one paint binding into the command stream (TS `sampleMorphShapePaintBinding`).
pub(crate) fn sample_paint_binding(
    data: &mut MorphShapeData,
    binding: &MorphShapePaintBinding,
    progress: f64,
) {
    let index = binding.command_index();
    if index + 9 >= data.commands.len() {
        return;
    }
    let key = data.commands[index].as_str().unwrap_or("").to_string();
    match binding {
        MorphShapePaintBinding::Color(binding) => {
            if key != "beginFill" {
                return;
            }
            data.commands[index + 2] = ShapeCommandToken::Number(interpolate_rgba(
                binding.start_color,
                binding.end_color,
                progress,
            ) as f64);
            data.commands[index + 3] = ShapeCommandToken::Number(interpolate_number(
                binding.start_alpha as f64,
                binding.end_alpha as f64,
                progress,
            ));
        }
        MorphShapePaintBinding::Line(binding) => {
            if key != "lineStyle" {
                return;
            }
            data.commands[index + 2] = ShapeCommandToken::Number(interpolate_number(
                binding.start_thickness,
                binding.end_thickness,
                progress,
            ));
            data.commands[index + 3] = ShapeCommandToken::Number(interpolate_rgba(
                binding.start_color,
                binding.end_color,
                progress,
            ) as f64);
            data.commands[index + 4] = ShapeCommandToken::Number(interpolate_number(
                binding.start_alpha as f64,
                binding.end_alpha as f64,
                progress,
            ));
        }
        MorphShapePaintBinding::Texture(binding) => {
            if key != binding.command_key {
                return;
            }
            if let Some(matrix) = data.commands[index + 3].as_matrix_mut() {
                sample_matrix(matrix, &binding.start_matrix, &binding.end_matrix, progress);
            }
        }
        MorphShapePaintBinding::Gradient(binding) => {
            if key != binding.command_key {
                return;
            }
            if let Some(colors) = data.commands[index + 3].as_numbers_mut() {
                for (stop, value) in binding.start_colors.iter().enumerate() {
                    if stop < colors.len() {
                        colors[stop] =
                            interpolate_rgba(*value, binding.end_colors[stop], progress) as f64;
                    }
                }
            }
            if let Some(alphas) = data.commands[index + 4].as_numbers_mut() {
                for (stop, value) in binding.start_alphas.iter().enumerate() {
                    if stop < alphas.len() {
                        alphas[stop] =
                            interpolate_number(*value, binding.end_alphas[stop], progress);
                    }
                }
            }
            if let Some(ratios) = data.commands[index + 5].as_numbers_mut() {
                for (stop, value) in binding.start_ratios.iter().enumerate() {
                    if stop < ratios.len() {
                        ratios[stop] =
                            interpolate_number(*value, binding.end_ratios[stop], progress);
                    }
                }
            }
            if let (Some(matrix), Some(start), Some(end)) = (
                data.commands[index + 6].as_matrix_mut(),
                binding.start_matrix.as_ref(),
                binding.end_matrix.as_ref(),
            ) {
                sample_matrix(matrix, start, end, progress);
            }
            data.commands[index + 9] = ShapeCommandToken::Number(interpolate_number(
                binding.start_focal_point_ratio,
                binding.end_focal_point_ratio,
                progress,
            ));
        }
    }
}
