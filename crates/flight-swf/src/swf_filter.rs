use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_adjustments::contract::create_color_matrix_adjustment;
use flight_effects::contract::{
    BevelType, EffectRef, create_bevel_effect, create_blur_effect, create_convolution_effect,
    create_drop_shadow_effect, create_gradient_bevel_effect, create_gradient_glow_effect,
    create_inner_glow_effect, create_inner_shadow_effect, create_outer_glow_effect,
};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_math::RAD_TO_DEG;

use crate::{SwfAdjustmentRef, SwfFilterListGuard, SwfGuardStateRef, SwfReader};

struct SwfFilterColor {
    alpha: f32,
    rgb: u32,
}

// flight-lint: allow(conform-params) D5: caller-owned SwfGuardState replaces the source module-level hook
pub fn read_swf_filter_list(
    guard_state: &SwfGuardStateRef,
    reader: &mut SwfReader,
    out_effects: &mut Vec<EffectRef>,
    out_adjustments: &mut Vec<SwfAdjustmentRef>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> bool {
    let count = reader.read_uint8();
    for index in 0..u32::from(count) {
        if !reader.valid {
            break;
        }
        let id = reader.read_uint8();
        if !reader.valid {
            return false;
        }
        if id == FILTER_DROP_SHADOW {
            let color = swf_filter_read_color(reader);
            let blur_x = swf_filter_read_fixed(reader);
            let blur_y = swf_filter_read_fixed(reader);
            let angle = swf_filter_read_fixed(reader) * RAD_TO_DEG;
            let distance = swf_filter_read_fixed(reader);
            let strength = reader.read_fixed8();
            let flags = reader.read_uint8();
            if !reader.valid {
                return false;
            }
            let effect: EffectRef = if flags & FILTER_INNER != 0 {
                let effect = create_inner_shadow_effect();
                {
                    let mut effect = effect.write().unwrap();
                    effect.alpha = Some(color.alpha);
                    effect.angle = Some(angle);
                    effect.blur_x = Some(blur_x);
                    effect.blur_y = Some(blur_y);
                    effect.color = Some(color.rgb);
                    effect.distance = Some(distance);
                    effect.quality = Some(f32::from(flags & FILTER_PASSES));
                    effect.strength = Some(strength);
                }
                effect
            } else {
                let effect = create_drop_shadow_effect();
                {
                    let mut effect = effect.write().unwrap();
                    effect.alpha = Some(color.alpha);
                    effect.angle = Some(angle);
                    effect.blur_x = Some(blur_x);
                    effect.blur_y = Some(blur_y);
                    effect.color = Some(color.rgb);
                    effect.distance = Some(distance);
                    effect.quality = Some(f32::from(flags & FILTER_PASSES));
                    effect.strength = Some(strength);
                }
                effect
            };
            out_effects.push(effect);
            continue;
        }
        if id == FILTER_BLUR {
            let blur_x = swf_filter_read_fixed(reader);
            let blur_y = swf_filter_read_fixed(reader);
            let blur_flags = reader.read_uint8();
            if !reader.valid {
                return false;
            }
            if blur_flags & FILTER_PASSES > 1 {
                swf_filter_report_field_diagnostic(diagnostics.as_deref_mut(), "passes", id);
            }
            let effect = create_blur_effect();
            {
                let mut effect = effect.write().unwrap();
                effect.blur_x = Some(blur_x);
                effect.blur_y = Some(blur_y);
            }
            out_effects.push(effect);
            continue;
        }
        if id == FILTER_GLOW {
            let color = swf_filter_read_color(reader);
            let blur_x = swf_filter_read_fixed(reader);
            let blur_y = swf_filter_read_fixed(reader);
            let strength = reader.read_fixed8();
            let flags = reader.read_uint8();
            if !reader.valid {
                return false;
            }
            let effect: EffectRef = if flags & FILTER_INNER != 0 {
                let effect = create_inner_glow_effect();
                {
                    let mut effect = effect.write().unwrap();
                    effect.alpha = Some(color.alpha);
                    effect.blur_x = Some(blur_x);
                    effect.blur_y = Some(blur_y);
                    effect.color = Some(color.rgb);
                    effect.quality = Some(f32::from(flags & FILTER_PASSES));
                    effect.strength = Some(strength);
                }
                effect
            } else {
                let effect = create_outer_glow_effect();
                {
                    let mut effect = effect.write().unwrap();
                    effect.alpha = Some(color.alpha);
                    effect.blur_x = Some(blur_x);
                    effect.blur_y = Some(blur_y);
                    effect.color = Some(color.rgb);
                    effect.quality = Some(f32::from(flags & FILTER_PASSES));
                    effect.strength = Some(strength);
                }
                effect
            };
            out_effects.push(effect);
            continue;
        }
        if id == FILTER_BEVEL {
            let shadow = swf_filter_read_color(reader);
            let highlight = swf_filter_read_color(reader);
            let blur_x = swf_filter_read_fixed(reader);
            let blur_y = swf_filter_read_fixed(reader);
            let angle = swf_filter_read_fixed(reader) * RAD_TO_DEG;
            let distance = swf_filter_read_fixed(reader);
            let strength = reader.read_fixed8();
            let flags = reader.read_uint8();
            if !reader.valid {
                return false;
            }
            let effect = create_bevel_effect();
            {
                let mut effect = effect.write().unwrap();
                effect.angle = Some(angle);
                effect.bevel_type = Some(swf_filter_resolve_bevel_type(flags));
                effect.blur_x = Some(blur_x);
                effect.blur_y = Some(blur_y);
                effect.distance = Some(distance);
                effect.highlight_alpha = Some(highlight.alpha);
                effect.highlight_color = Some(highlight.rgb);
                effect.quality = Some(f32::from(flags & FILTER_BEVEL_PASSES));
                effect.shadow_alpha = Some(shadow.alpha);
                effect.shadow_color = Some(shadow.rgb);
                effect.strength = Some(strength);
            }
            out_effects.push(effect);
            continue;
        }
        if id == FILTER_GRADIENT_GLOW || id == FILTER_GRADIENT_BEVEL {
            let stop_count = reader.read_uint8();
            let mut colors = Vec::with_capacity(usize::from(stop_count));
            let mut alphas = Vec::with_capacity(usize::from(stop_count));
            let mut ratios = Vec::with_capacity(usize::from(stop_count));
            for _ in 0..stop_count {
                let color = swf_filter_read_color(reader);
                colors.push(color.rgb);
                alphas.push(color.alpha);
            }
            for _ in 0..stop_count {
                ratios.push(f32::from(reader.read_uint8()));
            }
            let blur_x = swf_filter_read_fixed(reader);
            let blur_y = swf_filter_read_fixed(reader);
            let angle = swf_filter_read_fixed(reader) * RAD_TO_DEG;
            let distance = swf_filter_read_fixed(reader);
            let strength = reader.read_fixed8();
            let flags = reader.read_uint8();
            if !reader.valid {
                return false;
            }
            if id == FILTER_GRADIENT_GLOW
                && (angle != 0.0
                    || distance != 0.0
                    || flags & (FILTER_INNER | FILTER_BEVEL_ON_TOP) != 0)
            {
                swf_filter_report_field_diagnostic(diagnostics.as_deref_mut(), "placement", id);
            }
            let effect: EffectRef = if id == FILTER_GRADIENT_GLOW {
                let effect = create_gradient_glow_effect();
                {
                    let mut effect = effect.write().unwrap();
                    effect.alphas = alphas;
                    effect.blur_x = Some(blur_x);
                    effect.blur_y = Some(blur_y);
                    effect.colors = colors;
                    effect.quality = Some(f32::from(flags & FILTER_BEVEL_PASSES));
                    effect.ratios = ratios;
                    effect.strength = Some(strength);
                }
                effect
            } else {
                let effect = create_gradient_bevel_effect();
                {
                    let mut effect = effect.write().unwrap();
                    effect.alphas = alphas;
                    effect.angle = Some(angle);
                    effect.bevel_type = Some(swf_filter_resolve_bevel_type(flags));
                    effect.blur_x = Some(blur_x);
                    effect.blur_y = Some(blur_y);
                    effect.colors = colors;
                    effect.distance = Some(distance);
                    effect.quality = Some(f32::from(flags & FILTER_BEVEL_PASSES));
                    effect.ratios = ratios;
                    effect.strength = Some(strength);
                }
                effect
            };
            out_effects.push(effect);
            continue;
        }
        if id == FILTER_CONVOLUTION {
            let matrix_x = reader.read_uint8();
            let matrix_y = reader.read_uint8();
            let divisor = swf_filter_read_float(reader);
            let bias = swf_filter_read_float(reader);
            let matrix_length = u32::from(matrix_x) * u32::from(matrix_y);
            let mut matrix = Vec::with_capacity(matrix_length as usize);
            for _ in 0..matrix_length {
                if !reader.valid {
                    break;
                }
                matrix.push(swf_filter_read_float(reader));
            }
            let color = swf_filter_read_color(reader);
            let flags = reader.read_uint8();
            if !reader.valid || matrix.len() != matrix_length as usize {
                return false;
            }
            let effect = create_convolution_effect();
            {
                let mut effect = effect.write().unwrap();
                effect.bias = Some(bias);
                effect.clamp = Some(flags & CONVOLUTION_CLAMP != 0);
                effect.color = Some(color.rgb);
                effect.divisor = Some(divisor);
                effect.matrix = matrix;
                effect.matrix_x = f32::from(matrix_x);
                effect.matrix_y = f32::from(matrix_y);
                effect.preserve_alpha = Some(flags & CONVOLUTION_PRESERVE_ALPHA != 0);
            }
            out_effects.push(effect);
            continue;
        }
        if id == FILTER_COLOR_MATRIX {
            let mut matrix = [0.0_f32; COLOR_MATRIX_LENGTH];
            for cell in &mut matrix {
                if !reader.valid {
                    break;
                }
                *cell = swf_filter_read_float(reader);
            }
            if !reader.valid {
                return false;
            }
            for row in 0..COLOR_MATRIX_ROWS {
                matrix[row * COLOR_MATRIX_COLUMNS + COLOR_MATRIX_BIAS_COLUMN] /= COLOR_CHANNEL_ONE;
            }
            let adjustment: SwfAdjustmentRef =
                Arc::new(RwLock::new(create_color_matrix_adjustment(matrix)));
            out_adjustments.push(adjustment);
            continue;
        }
        let guard = guard_state.read().unwrap().filter_list_guard.clone();
        if let Some(guard) = guard {
            guard(u32::from(id), index);
        }
        return false;
    }
    return reader.valid;
}

// flight-lint: allow(conform-params) D5: caller-owned SwfGuardState replaces the source module-level hook
pub fn set_swf_filter_list_guard(
    guard_state: &SwfGuardStateRef,
    guard: Option<SwfFilterListGuard>,
) {
    guard_state.write().unwrap().filter_list_guard = guard;
}

fn swf_filter_read_color(reader: &mut SwfReader) -> SwfFilterColor {
    let red = reader.read_uint8();
    let green = reader.read_uint8();
    let blue = reader.read_uint8();
    let alpha = reader.read_uint8();
    return SwfFilterColor {
        alpha: f32::from(alpha) / COLOR_CHANNEL_ONE,
        rgb: u32::from(red) * 0x10000 + u32::from(green) * 0x100 + u32::from(blue),
    };
}

fn swf_filter_read_fixed(reader: &mut SwfReader) -> f32 {
    let value = reader.read_uint32() as i32;
    return value as f32 / FIXED_16_ONE;
}

fn swf_filter_read_float(reader: &mut SwfReader) -> f32 {
    return f32::from_bits(reader.read_uint32());
}

fn swf_filter_report_field_diagnostic(
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    field: &str,
    filter_id: u8,
) {
    let mut detail = HashMap::new();
    detail.insert(
        "capability".to_string(),
        ImportDiagnosticDetailValue::String("swf.placement.filter-list".to_string()),
    );
    detail.insert(
        "field".to_string(),
        ImportDiagnosticDetailValue::String(field.to_string()),
    );
    detail.insert(
        "filterId".to_string(),
        ImportDiagnosticDetailValue::Number(f32::from(filter_id)),
    );
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Skip,
        "swf.filter-field-unrepresentable",
        "readSwfFilterList",
        Some(detail),
    );
}

fn swf_filter_resolve_bevel_type(flags: u8) -> BevelType {
    if flags & FILTER_INNER != 0 {
        return BevelType::Inner;
    }
    return if flags & FILTER_BEVEL_ON_TOP != 0 {
        BevelType::Full
    } else {
        BevelType::Outer
    };
}

const COLOR_CHANNEL_ONE: f32 = 0xff as f32;
const COLOR_MATRIX_BIAS_COLUMN: usize = 4;
const COLOR_MATRIX_COLUMNS: usize = 5;
const COLOR_MATRIX_LENGTH: usize = 20;
const COLOR_MATRIX_ROWS: usize = 4;
const CONVOLUTION_CLAMP: u8 = 0x02;
const CONVOLUTION_PRESERVE_ALPHA: u8 = 0x01;
const FILTER_BEVEL: u8 = 3;
const FILTER_BEVEL_ON_TOP: u8 = 0x10;
const FILTER_BEVEL_PASSES: u8 = 0x0f;
const FILTER_BLUR: u8 = 1;
const FILTER_COLOR_MATRIX: u8 = 6;
const FILTER_CONVOLUTION: u8 = 5;
const FILTER_DROP_SHADOW: u8 = 0;
const FILTER_GLOW: u8 = 2;
const FILTER_GRADIENT_BEVEL: u8 = 7;
const FILTER_GRADIENT_GLOW: u8 = 4;
const FILTER_INNER: u8 = 0x80;
const FILTER_PASSES: u8 = 0x1f;
const FIXED_16_ONE: f32 = 0x10000 as f32;
