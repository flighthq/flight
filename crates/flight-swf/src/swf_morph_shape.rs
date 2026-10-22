// flight-lint: allow-file(f64) path geometry, shape commands, gradient stops, and morph progress use canonical f64 lanes; SWF matrices remain f32
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::{Matrix, create_matrix};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_path::{PathMorph, create_path_morph};
use flight_shape::contract::SpreadMethod;
use flight_shape::{
    CapsStyle, GradientType, InterpolationMethod, JointStyle, LineScaleMode, MorphShape,
    MorphShapeColorEndpoint, MorphShapeGradientEndpoint, MorphShapeLineEndpoint,
    append_morph_shape_begin_fill, append_morph_shape_begin_gradient_fill,
    append_morph_shape_begin_texture_fill, append_morph_shape_line_style, append_morph_shape_path,
    create_morph_shape,
};
use flight_texture::Texture;

use crate::{SwfMorphPathPair, SwfReader, read_swf_morph_shape_paths};

pub type SwfMorphBitmapFillResolver =
    Arc<dyn Fn(u32, bool, bool) -> Option<Ref<Texture>> + Send + Sync>;

struct SwfMorphFill {
    end_alpha: f32,
    end_color: u32,
    end_gradient: Option<MorphShapeGradientEndpoint>,
    end_texture_matrix: Matrix,
    gradient_type: Option<GradientType>,
    spread_method: SpreadMethod,
    start_alpha: f32,
    start_color: u32,
    start_gradient: Option<MorphShapeGradientEndpoint>,
    start_texture_matrix: Matrix,
    texture: Option<Ref<Texture>>,
}

struct SwfMorphLine {
    caps: CapsStyle,
    end_alpha: f32,
    end_color: u32,
    end_width: u32,
    joints: JointStyle,
    miter_limit: f64,
    pixel_hinting: bool,
    start_alpha: f32,
    start_color: u32,
    start_width: u32,
}

struct SwfMorphPreparedPath {
    index: u32,
    morph: Ref<PathMorph>,
}

pub fn create_swf_morph_shape(
    reader: &mut SwfReader,
    version: u32,
    resolve_bitmap_fill: Option<&SwfMorphBitmapFillResolver>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Ref<MorphShape>> {
    if version >= 2 {
        if !swf_morph_skip_rectangle(reader) || !swf_morph_skip_rectangle(reader) {
            return None;
        }
        reader.read_uint8();
    }
    let end_edges_offset = reader.read_uint32();
    let end_edges_start = reader.pos.checked_add(end_edges_offset as usize)?;
    if !reader.valid || end_edges_start > reader.end || end_edges_offset == 0 {
        return None;
    }

    let fills = swf_morph_read_fill_styles(reader, version, resolve_bitmap_fill)?;
    let lines = swf_morph_read_line_styles(reader, version, resolve_bitmap_fill)?;
    let mut start_reader = SwfReader::new(reader.source.clone(), reader.pos, end_edges_start);
    let mut end_reader = SwfReader::new(reader.source.clone(), end_edges_start, reader.end);
    let paths = read_swf_morph_shape_paths(&mut start_reader, &mut end_reader)?;

    let mut declined = 0;
    let node = swf_morph_create_node(&fills, &lines, &paths.fills, &paths.lines, &mut declined);
    if declined > 0 {
        let mut detail = HashMap::new();
        detail.insert(
            "lostPairs".to_string(),
            ImportDiagnosticDetailValue::Number(declined as f32),
        );
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Drop,
            "swf.morph-path-pair-declined",
            "createSwfMorphShape",
            Some(detail),
        );
    }
    return node;
}

fn swf_morph_append_fill_style(shape: &Ref<MorphShape>, fill: &SwfMorphFill) -> bool {
    if let Some(texture) = &fill.texture {
        append_morph_shape_begin_texture_fill(
            shape,
            texture,
            Some(&fill.start_texture_matrix),
            Some(&fill.end_texture_matrix),
        );
        return true;
    }
    let Some(gradient_type) = fill.gradient_type else {
        append_morph_shape_begin_fill(
            shape,
            &MorphShapeColorEndpoint {
                alpha: Some(fill.start_alpha),
                color: fill.start_color,
            },
            &MorphShapeColorEndpoint {
                alpha: Some(fill.end_alpha),
                color: fill.end_color,
            },
        );
        return true;
    };
    return append_morph_shape_begin_gradient_fill(
        shape,
        gradient_type,
        fill.start_gradient.as_ref().unwrap(),
        fill.end_gradient.as_ref().unwrap(),
        Some(fill.spread_method),
        Some(InterpolationMethod::Rgb),
    );
}

fn swf_morph_create_fill() -> SwfMorphFill {
    return SwfMorphFill {
        end_alpha: 1.0,
        end_color: 0,
        end_gradient: None,
        end_texture_matrix: create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0),
        gradient_type: None,
        spread_method: SpreadMethod::Pad,
        start_alpha: 1.0,
        start_color: 0,
        start_gradient: None,
        start_texture_matrix: create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0),
        texture: None,
    };
}

fn swf_morph_create_node(
    fills: &[SwfMorphFill],
    lines: &[SwfMorphLine],
    fill_paths: &HashMap<u32, SwfMorphPathPair>,
    line_paths: &HashMap<u32, SwfMorphPathPair>,
    declined: &mut u32,
) -> Option<Ref<MorphShape>> {
    let paired = swf_morph_pair_paths(fill_paths, declined);
    let paired_lines = swf_morph_pair_paths(line_paths, declined);
    let first = paired.first().or_else(|| paired_lines.first())?;
    let shape = create_morph_shape(&first.morph);

    for prepared in paired {
        let Some(fill) = prepared
            .index
            .checked_sub(1)
            .and_then(|index| fills.get(index as usize))
        else {
            continue;
        };
        if swf_morph_append_fill_style(&shape, fill) {
            append_morph_shape_path(&shape, &prepared.morph);
        }
    }

    for prepared in paired_lines {
        let Some(line) = prepared
            .index
            .checked_sub(1)
            .and_then(|index| lines.get(index as usize))
        else {
            continue;
        };
        append_morph_shape_line_style(
            &shape,
            &MorphShapeLineEndpoint {
                alpha: Some(line.start_alpha),
                color: line.start_color,
                thickness: f64::from(line.start_width) / TWIPS_PER_PIXEL,
            },
            &MorphShapeLineEndpoint {
                alpha: Some(line.end_alpha),
                color: line.end_color,
                thickness: f64::from(line.end_width) / TWIPS_PER_PIXEL,
            },
            Some(line.pixel_hinting),
            Some(LineScaleMode::Normal),
            Some(line.caps),
            Some(line.joints),
            Some(line.miter_limit),
        );
        append_morph_shape_path(&shape, &prepared.morph);
    }

    let has_commands = !shape.read().unwrap().data.commands.is_empty();
    return has_commands.then_some(shape);
}

fn swf_morph_create_texture_matrix(matrix: &Matrix) -> Matrix {
    return create_matrix(
        matrix.a / TWIPS_PER_PIXEL as f32,
        matrix.b / TWIPS_PER_PIXEL as f32,
        matrix.c / TWIPS_PER_PIXEL as f32,
        matrix.d / TWIPS_PER_PIXEL as f32,
        matrix.tx,
        matrix.ty,
    );
}

// flight-lint: allow(hashmap-iteration) morph style keys are explicitly sorted before retained path construction
fn swf_morph_pair_paths(
    paths: &HashMap<u32, SwfMorphPathPair>,
    declined: &mut u32,
) -> Vec<SwfMorphPreparedPath> {
    let mut indices: Vec<u32> = paths.keys().copied().collect();
    indices.sort_unstable();
    let mut pairs = Vec::new();
    for index in indices {
        let pair = &paths[&index];
        if let Some(morph) = create_path_morph(&pair.start, &pair.end) {
            pairs.push(SwfMorphPreparedPath {
                index,
                morph: Arc::new(RwLock::new(morph)),
            });
        } else {
            *declined += 1;
        }
    }
    return pairs;
}

fn swf_morph_read_color(reader: &mut SwfReader) -> (u32, f32) {
    let red = reader.read_uint8();
    let green = reader.read_uint8();
    let blue = reader.read_uint8();
    let alpha = reader.read_uint8();
    return (
        u32::from(red) << 24 | u32::from(green) << 16 | u32::from(blue) << 8 | 0xff,
        f32::from(alpha) / 0xff as f32,
    );
}

fn swf_morph_read_fill_style(
    reader: &mut SwfReader,
    version: u32,
    resolve_bitmap_fill: Option<&SwfMorphBitmapFillResolver>,
) -> Option<SwfMorphFill> {
    let fill_type = reader.read_uint8();
    if !reader.valid {
        return None;
    }
    if fill_type == FILL_SOLID {
        let (start_color, start_alpha) = swf_morph_read_color(reader);
        let (end_color, end_alpha) = swf_morph_read_color(reader);
        if !reader.valid {
            return None;
        }
        let mut fill = swf_morph_create_fill();
        fill.end_alpha = end_alpha;
        fill.end_color = end_color;
        fill.start_alpha = start_alpha;
        fill.start_color = start_color;
        return Some(fill);
    }
    if matches!(
        fill_type,
        FILL_LINEAR_GRADIENT | FILL_RADIAL_GRADIENT | FILL_FOCAL_GRADIENT
    ) {
        let start_matrix = swf_morph_read_matrix(reader);
        let end_matrix = swf_morph_read_matrix(reader);
        let stops = reader.read_uint8();
        if !reader.valid || stops == 0 || stops > MAX_GRADIENT_STOPS {
            return None;
        }
        let mut start_colors = Vec::new();
        let mut start_alphas = Vec::new();
        let mut start_ratios = Vec::new();
        let mut end_colors = Vec::new();
        let mut end_alphas = Vec::new();
        let mut end_ratios = Vec::new();
        for _ in 0..stops {
            start_ratios.push(f64::from(reader.read_uint8()) / 0xff as f64);
            let (start_color, start_alpha) = swf_morph_read_color(reader);
            start_colors.push(start_color);
            start_alphas.push(f64::from(start_alpha));
            end_ratios.push(f64::from(reader.read_uint8()) / 0xff as f64);
            let (end_color, end_alpha) = swf_morph_read_color(reader);
            end_colors.push(end_color);
            end_alphas.push(f64::from(end_alpha));
        }
        let start_focal = if fill_type == FILL_FOCAL_GRADIENT && version >= 2 {
            swf_morph_read_fixed8(reader)
        } else {
            0.0
        };
        let end_focal = if fill_type == FILL_FOCAL_GRADIENT && version >= 2 {
            swf_morph_read_fixed8(reader)
        } else {
            0.0
        };
        if !reader.valid {
            return None;
        }
        let mut fill = swf_morph_create_fill();
        fill.end_gradient = Some(MorphShapeGradientEndpoint {
            alphas: end_alphas,
            colors: end_colors,
            focal_point_ratio: Some(end_focal),
            matrix: Some(end_matrix),
            ratios: end_ratios,
        });
        fill.gradient_type = Some(if fill_type == FILL_LINEAR_GRADIENT {
            GradientType::Linear
        } else {
            GradientType::Radial
        });
        fill.start_gradient = Some(MorphShapeGradientEndpoint {
            alphas: start_alphas,
            colors: start_colors,
            focal_point_ratio: Some(start_focal),
            matrix: Some(start_matrix),
            ratios: start_ratios,
        });
        return Some(fill);
    }
    if matches!(
        fill_type,
        FILL_REPEATING_BITMAP
            | FILL_CLIPPED_BITMAP
            | FILL_NON_SMOOTHED_REPEATING_BITMAP
            | FILL_NON_SMOOTHED_CLIPPED_BITMAP
    ) {
        let character_id = u32::from(reader.read_uint16());
        let start_matrix = swf_morph_read_matrix(reader);
        let end_matrix = swf_morph_read_matrix(reader);
        if !reader.valid {
            return None;
        }
        let repeat = matches!(
            fill_type,
            FILL_REPEATING_BITMAP | FILL_NON_SMOOTHED_REPEATING_BITMAP
        );
        let smoothed = matches!(fill_type, FILL_REPEATING_BITMAP | FILL_CLIPPED_BITMAP);
        let mut fill = swf_morph_create_fill();
        fill.end_texture_matrix = swf_morph_create_texture_matrix(&end_matrix);
        fill.start_texture_matrix = swf_morph_create_texture_matrix(&start_matrix);
        fill.texture =
            resolve_bitmap_fill.and_then(|resolve| resolve(character_id, repeat, smoothed));
        return Some(fill);
    }
    return None;
}

fn swf_morph_read_fill_styles(
    reader: &mut SwfReader,
    version: u32,
    resolve_bitmap_fill: Option<&SwfMorphBitmapFillResolver>,
) -> Option<Vec<SwfMorphFill>> {
    let count = swf_morph_read_style_count(reader)?;
    let mut fills = Vec::new();
    for _ in 0..count {
        fills.push(swf_morph_read_fill_style(
            reader,
            version,
            resolve_bitmap_fill,
        )?);
    }
    return Some(fills);
}

fn swf_morph_read_fixed8(reader: &mut SwfReader) -> f64 {
    let value = reader.read_uint16() as i16;
    return f64::from(value) / FIXED_8_8_ONE;
}

fn swf_morph_read_line_style(
    reader: &mut SwfReader,
    version: u32,
    resolve_bitmap_fill: Option<&SwfMorphBitmapFillResolver>,
) -> Option<SwfMorphLine> {
    let start_width = u32::from(reader.read_uint16());
    let end_width = u32::from(reader.read_uint16());
    if !reader.valid {
        return None;
    }
    if version < 2 {
        let (start_color, start_alpha) = swf_morph_read_color(reader);
        let (end_color, end_alpha) = swf_morph_read_color(reader);
        return reader.valid.then_some(SwfMorphLine {
            caps: CapsStyle::Round,
            end_alpha,
            end_color,
            end_width,
            joints: JointStyle::Round,
            miter_limit: 3.0,
            pixel_hinting: false,
            start_alpha,
            start_color,
            start_width,
        });
    }
    let start_caps = reader.read_unsigned_bits(2) as u32;
    let join_style = reader.read_unsigned_bits(2) as u32;
    let has_fill = reader.read_unsigned_bits(1) != 0.0;
    reader.read_unsigned_bits(2);
    let pixel_hinting = reader.read_unsigned_bits(1) != 0.0;
    reader.read_unsigned_bits(5);
    reader.read_unsigned_bits(1);
    reader.read_unsigned_bits(2);
    let miter_limit = if join_style == JOIN_MITER {
        f64::from(reader.read_uint16()) / FIXED_8_8_ONE
    } else {
        3.0
    };
    if !reader.valid {
        return None;
    }
    if has_fill {
        let fill = swf_morph_read_fill_style(reader, version, resolve_bitmap_fill)?;
        return Some(SwfMorphLine {
            caps: swf_morph_resolve_caps_style(start_caps),
            end_alpha: fill.end_alpha,
            end_color: fill.end_color,
            end_width,
            joints: swf_morph_resolve_joint_style(join_style),
            miter_limit,
            pixel_hinting,
            start_alpha: fill.start_alpha,
            start_color: fill.start_color,
            start_width,
        });
    }
    let (start_color, start_alpha) = swf_morph_read_color(reader);
    let (end_color, end_alpha) = swf_morph_read_color(reader);
    return reader.valid.then_some(SwfMorphLine {
        caps: swf_morph_resolve_caps_style(start_caps),
        end_alpha,
        end_color,
        end_width,
        joints: swf_morph_resolve_joint_style(join_style),
        miter_limit,
        pixel_hinting,
        start_alpha,
        start_color,
        start_width,
    });
}

fn swf_morph_read_line_styles(
    reader: &mut SwfReader,
    version: u32,
    resolve_bitmap_fill: Option<&SwfMorphBitmapFillResolver>,
) -> Option<Vec<SwfMorphLine>> {
    let count = swf_morph_read_style_count(reader)?;
    let mut lines = Vec::new();
    for _ in 0..count {
        lines.push(swf_morph_read_line_style(
            reader,
            version,
            resolve_bitmap_fill,
        )?);
    }
    return Some(lines);
}

fn swf_morph_read_matrix(reader: &mut SwfReader) -> Matrix {
    let mut a = 1.0;
    let mut d = 1.0;
    if reader.read_unsigned_bits(1) != 0.0 {
        let scale_bits = reader.read_unsigned_bits(5) as u8;
        a = reader.read_signed_bits(scale_bits) as f32 / FIXED_16_ONE;
        d = reader.read_signed_bits(scale_bits) as f32 / FIXED_16_ONE;
    }
    let mut b = 0.0;
    let mut c = 0.0;
    if reader.read_unsigned_bits(1) != 0.0 {
        let rotate_bits = reader.read_unsigned_bits(5) as u8;
        b = reader.read_signed_bits(rotate_bits) as f32 / FIXED_16_ONE;
        c = reader.read_signed_bits(rotate_bits) as f32 / FIXED_16_ONE;
    }
    let translate_bits = reader.read_unsigned_bits(5) as u8;
    let tx = reader.read_signed_bits(translate_bits) as f32 / TWIPS_PER_PIXEL as f32;
    let ty = reader.read_signed_bits(translate_bits) as f32 / TWIPS_PER_PIXEL as f32;
    reader.align_to_byte();
    return create_matrix(a, b, c, d, tx, ty);
}

fn swf_morph_read_style_count(reader: &mut SwfReader) -> Option<u32> {
    let count = reader.read_uint8();
    let resolved = if count == EXTENDED_STYLE_COUNT {
        u32::from(reader.read_uint16())
    } else {
        u32::from(count)
    };
    return (reader.valid && resolved <= MAX_MORPH_STYLES).then_some(resolved);
}

fn swf_morph_resolve_caps_style(value: u32) -> CapsStyle {
    if value == CAP_NONE {
        return CapsStyle::None;
    }
    return if value == CAP_SQUARE {
        CapsStyle::Square
    } else {
        CapsStyle::Round
    };
}

fn swf_morph_resolve_joint_style(value: u32) -> JointStyle {
    if value == JOIN_BEVEL {
        return JointStyle::Bevel;
    }
    return if value == JOIN_MITER {
        JointStyle::Miter
    } else {
        JointStyle::Round
    };
}

fn swf_morph_skip_rectangle(reader: &mut SwfReader) -> bool {
    let bits = reader.read_unsigned_bits(5) as u8;
    for _ in 0..4 {
        reader.read_signed_bits(bits);
    }
    reader.align_to_byte();
    return reader.valid;
}

const CAP_NONE: u32 = 1;
const CAP_SQUARE: u32 = 2;
const EXTENDED_STYLE_COUNT: u8 = 0xff;
const FILL_CLIPPED_BITMAP: u8 = 0x41;
const FILL_FOCAL_GRADIENT: u8 = 0x13;
const FILL_LINEAR_GRADIENT: u8 = 0x10;
const FILL_NON_SMOOTHED_CLIPPED_BITMAP: u8 = 0x43;
const FILL_NON_SMOOTHED_REPEATING_BITMAP: u8 = 0x42;
const FILL_RADIAL_GRADIENT: u8 = 0x12;
const FILL_REPEATING_BITMAP: u8 = 0x40;
const FILL_SOLID: u8 = 0;
const FIXED_8_8_ONE: f64 = 0x100 as f64;
const FIXED_16_ONE: f32 = 0x10000 as f32;
const JOIN_BEVEL: u32 = 1;
const JOIN_MITER: u32 = 2;
const MAX_GRADIENT_STOPS: u8 = 15;
const MAX_MORPH_STYLES: u32 = 0xffff;
const TWIPS_PER_PIXEL: f64 = 20.0;
