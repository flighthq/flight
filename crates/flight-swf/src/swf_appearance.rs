use std::sync::{Arc, LazyLock, RwLock};

use flight_adjustments::contract::create_color_scale_bias_adjustment;
use flight_effects::contract::{
    ADVANCED_BLEND_MODE_DIFFERENCE, ADVANCED_BLEND_MODE_HARD_LIGHT, ADVANCED_BLEND_MODE_OVERLAY,
    AdvancedBlendMode, EffectRef,
};
use flight_materials::contract::create_color_scale_bias;
use flight_materials::{
    BLEND_MODE_ADD, BLEND_MODE_DARKEN, BLEND_MODE_LIGHTEN, BLEND_MODE_MULTIPLY, BLEND_MODE_NORMAL,
    BLEND_MODE_SCREEN, BlendMode,
};

use crate::{SwfAdjustmentRef, SwfAdjustmentStack, SwfColorTransform, SwfEffectStack, SwfReader};

pub static EMPTY_ADJUSTMENTS: LazyLock<SwfAdjustmentStack> = LazyLock::new(|| Arc::new(Vec::new()));
pub static EMPTY_EFFECTS: LazyLock<SwfEffectStack> =
    LazyLock::new(|| Arc::new(Vec::<EffectRef>::new()));

pub fn join_swf_color_adjustments(
    color_transform: Option<&SwfAdjustmentStack>,
    filters: &SwfAdjustmentStack,
) -> Option<SwfAdjustmentStack> {
    if filters.is_empty() {
        return color_transform.cloned();
    }
    let Some(color_transform) = color_transform else {
        return Some(filters.clone());
    };
    let mut joined = Vec::with_capacity(color_transform.len() + filters.len());
    joined.extend(color_transform.iter().cloned());
    joined.extend(filters.iter().cloned());
    return Some(Arc::new(joined));
}

pub fn read_swf_color_transform(reader: &mut SwfReader, channel_count: u32) -> SwfColorTransform {
    let has_add = reader.read_unsigned_bits(1) != 0.0;
    let has_multiply = reader.read_unsigned_bits(1) != 0.0;
    let bits = reader.read_unsigned_bits(4) as u8;
    let mut multiply = [1.0_f32; 4];
    let mut add = [0.0_f32; 4];
    if has_multiply {
        for channel in 0..channel_count.min(4) {
            multiply[channel as usize] = reader.read_signed_bits(bits) as f32 / FIXED_8_8_ONE;
        }
    }
    if has_add {
        for channel in 0..channel_count.min(4) {
            add[channel as usize] = reader.read_signed_bits(bits) as f32 / COLOR_CHANNEL_ONE;
        }
    }
    reader.align_to_byte();

    let alpha = if channel_count > ALPHA_CHANNEL {
        multiply[ALPHA_CHANNEL as usize].clamp(0.0, 1.0)
    } else {
        1.0
    };
    let alpha_bias = if alpha > 0.0 {
        add[ALPHA_CHANNEL as usize] / alpha
    } else {
        0.0
    };
    let tints = multiply[0] != 1.0
        || multiply[1] != 1.0
        || multiply[2] != 1.0
        || add[0] != 0.0
        || add[1] != 0.0
        || add[2] != 0.0;
    if !tints && alpha_bias == 0.0 {
        return SwfColorTransform {
            alpha,
            color_adjustments: None,
        };
    }
    let mut color_scale_bias = create_color_scale_bias();
    color_scale_bias.alpha_bias = alpha_bias;
    color_scale_bias.blue_bias = add[2];
    color_scale_bias.blue_scale = multiply[2];
    color_scale_bias.green_bias = add[1];
    color_scale_bias.green_scale = multiply[1];
    color_scale_bias.red_bias = add[0];
    color_scale_bias.red_scale = multiply[0];
    let adjustment: SwfAdjustmentRef = Arc::new(RwLock::new(create_color_scale_bias_adjustment(
        &color_scale_bias,
    )));
    return SwfColorTransform {
        alpha,
        color_adjustments: Some(Arc::new(vec![adjustment])),
    };
}

pub fn resolve_swf_advanced_blend_mode(value: u32) -> Option<AdvancedBlendMode> {
    if value == SWF_BLEND_DIFFERENCE {
        return Some(ADVANCED_BLEND_MODE_DIFFERENCE.to_string());
    }
    if value == SWF_BLEND_OVERLAY {
        return Some(ADVANCED_BLEND_MODE_OVERLAY.to_string());
    }
    return if value == SWF_BLEND_HARD_LIGHT {
        Some(ADVANCED_BLEND_MODE_HARD_LIGHT.to_string())
    } else {
        None
    };
}

pub fn resolve_swf_blend_mode(value: u32) -> BlendMode {
    if value == SWF_BLEND_MULTIPLY {
        return BLEND_MODE_MULTIPLY.to_string();
    }
    if value == SWF_BLEND_SCREEN {
        return BLEND_MODE_SCREEN.to_string();
    }
    if value == SWF_BLEND_LIGHTEN {
        return BLEND_MODE_LIGHTEN.to_string();
    }
    if value == SWF_BLEND_DARKEN {
        return BLEND_MODE_DARKEN.to_string();
    }
    return if value == SWF_BLEND_ADD {
        BLEND_MODE_ADD.to_string()
    } else {
        BLEND_MODE_NORMAL.to_string()
    };
}

const ALPHA_CHANNEL: u32 = 3;
const COLOR_CHANNEL_ONE: f32 = 0xff as f32;
const FIXED_8_8_ONE: f32 = 0x100 as f32;
const SWF_BLEND_ADD: u32 = 8;
const SWF_BLEND_DARKEN: u32 = 6;
const SWF_BLEND_DIFFERENCE: u32 = 7;
const SWF_BLEND_HARD_LIGHT: u32 = 14;
const SWF_BLEND_LIGHTEN: u32 = 5;
const SWF_BLEND_MULTIPLY: u32 = 3;
const SWF_BLEND_OVERLAY: u32 = 13;
const SWF_BLEND_SCREEN: u32 = 4;
