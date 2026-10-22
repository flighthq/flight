use crate::contract::{
    ADVANCED_BLEND_MODE_COLOR, ADVANCED_BLEND_MODE_COLOR_BURN, ADVANCED_BLEND_MODE_COLOR_DODGE,
    ADVANCED_BLEND_MODE_DARKEN, ADVANCED_BLEND_MODE_DIFFERENCE, ADVANCED_BLEND_MODE_EXCLUSION,
    ADVANCED_BLEND_MODE_HARD_LIGHT, ADVANCED_BLEND_MODE_HUE, ADVANCED_BLEND_MODE_LIGHTEN,
    ADVANCED_BLEND_MODE_LUMINOSITY, ADVANCED_BLEND_MODE_OVERLAY, ADVANCED_BLEND_MODE_SATURATION,
    ADVANCED_BLEND_MODE_SOFT_LIGHT,
};

fn blend_luminosity(r: f32, g: f32, b: f32) -> f32 {
    return 0.3 * r + 0.59 * g + 0.11 * b;
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn blend_non_separable_rgb(
    out: &mut [f32],
    mode: &str,
    cb_r: f32,
    cb_g: f32,
    cb_b: f32,
    cs_r: f32,
    cs_g: f32,
    cs_b: f32,
) {
    let (r, g, b) = match mode {
        ADVANCED_BLEND_MODE_HUE => {
            let (r, g, b) =
                set_blend_saturation(cs_r, cs_g, cs_b, blend_saturation(cb_r, cb_g, cb_b));
            set_blend_luminosity(r, g, b, blend_luminosity(cb_r, cb_g, cb_b))
        }
        ADVANCED_BLEND_MODE_SATURATION => {
            let (r, g, b) =
                set_blend_saturation(cb_r, cb_g, cb_b, blend_saturation(cs_r, cs_g, cs_b));
            set_blend_luminosity(r, g, b, blend_luminosity(cb_r, cb_g, cb_b))
        }
        ADVANCED_BLEND_MODE_COLOR => {
            set_blend_luminosity(cs_r, cs_g, cs_b, blend_luminosity(cb_r, cb_g, cb_b))
        }
        ADVANCED_BLEND_MODE_LUMINOSITY => {
            set_blend_luminosity(cb_r, cb_g, cb_b, blend_luminosity(cs_r, cs_g, cs_b))
        }
        _ => (cs_r, cs_g, cs_b),
    };
    out[0] = r;
    out[1] = g;
    out[2] = b;
}

fn blend_saturation(r: f32, g: f32, b: f32) -> f32 {
    return r.max(g).max(b) - r.min(g).min(b);
}

fn clip_blend_color(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let l = blend_luminosity(r, g, b);
    let min = r.min(g).min(b);
    let max = r.max(g).max(b);
    let (mut cr, mut cg, mut cb) = (r, g, b);
    if min < 0.0 {
        let denom = l - min;
        cr = l + ((cr - l) * l) / denom;
        cg = l + ((cg - l) * l) / denom;
        cb = l + ((cb - l) * l) / denom;
    }
    if max > 1.0 {
        let denom = max - l;
        cr = l + ((cr - l) * (1.0 - l)) / denom;
        cg = l + ((cg - l) * (1.0 - l)) / denom;
        cb = l + ((cb - l) * (1.0 - l)) / denom;
    }
    return (cr, cg, cb);
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_advanced_blend_rgb(
    out: &mut [f32],
    mode: &str,
    cb_r: f32,
    cb_g: f32,
    cb_b: f32,
    cs_r: f32,
    cs_g: f32,
    cs_b: f32,
) {
    if is_non_separable_blend_mode(mode) {
        blend_non_separable_rgb(out, mode, cb_r, cb_g, cb_b, cs_r, cs_g, cs_b);
        return;
    }
    let r = get_separable_blend_channel(mode, cb_r, cs_r);
    let g = get_separable_blend_channel(mode, cb_g, cs_g);
    let b = get_separable_blend_channel(mode, cb_b, cs_b);
    out[0] = r;
    out[1] = g;
    out[2] = b;
}

pub fn get_separable_blend_channel(mode: &str, cb: f32, cs: f32) -> f32 {
    return match mode {
        ADVANCED_BLEND_MODE_OVERLAY => {
            if cb <= 0.5 {
                2.0 * cb * cs
            } else {
                1.0 - 2.0 * (1.0 - cb) * (1.0 - cs)
            }
        }
        ADVANCED_BLEND_MODE_HARD_LIGHT => {
            if cs <= 0.5 {
                2.0 * cb * cs
            } else {
                1.0 - 2.0 * (1.0 - cb) * (1.0 - cs)
            }
        }
        ADVANCED_BLEND_MODE_SOFT_LIGHT => {
            let d = if cb <= 0.25 {
                ((16.0 * cb - 12.0) * cb + 4.0) * cb
            } else {
                cb.sqrt()
            };
            if cs <= 0.5 {
                cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb)
            } else {
                cb + (2.0 * cs - 1.0) * (d - cb)
            }
        }
        ADVANCED_BLEND_MODE_DARKEN => cb.min(cs),
        ADVANCED_BLEND_MODE_DIFFERENCE => (cb - cs).abs(),
        ADVANCED_BLEND_MODE_EXCLUSION => cb + cs - 2.0 * cb * cs,
        ADVANCED_BLEND_MODE_COLOR_DODGE => {
            if cb <= 0.0 {
                0.0
            } else if cs >= 1.0 {
                1.0
            } else {
                1.0_f32.min(cb / (1.0 - cs))
            }
        }
        ADVANCED_BLEND_MODE_LIGHTEN => cb.max(cs),
        ADVANCED_BLEND_MODE_COLOR_BURN => {
            if cb >= 1.0 {
                1.0
            } else if cs <= 0.0 {
                0.0
            } else {
                1.0 - 1.0_f32.min((1.0 - cb) / cs)
            }
        }
        _ => cs,
    };
}

pub fn is_non_separable_blend_mode(mode: &str) -> bool {
    return matches!(
        mode,
        ADVANCED_BLEND_MODE_HUE
            | ADVANCED_BLEND_MODE_SATURATION
            | ADVANCED_BLEND_MODE_COLOR
            | ADVANCED_BLEND_MODE_LUMINOSITY
    );
}

fn set_blend_luminosity(r: f32, g: f32, b: f32, target: f32) -> (f32, f32, f32) {
    let d = target - blend_luminosity(r, g, b);
    return clip_blend_color(r + d, g + d, b + d);
}

fn set_blend_saturation(r: f32, g: f32, b: f32, target: f32) -> (f32, f32, f32) {
    let mut out = [r, g, b];
    let mut i_min = 0;
    let mut i_max = 0;
    for i in 1..3 {
        if out[i] < out[i_min] {
            i_min = i;
        }
        if out[i] > out[i_max] {
            i_max = i;
        }
    }
    if i_min == i_max {
        i_max = (i_min + 1) % 3;
    }
    let i_mid = 3 - i_min - i_max;
    if out[i_max] > out[i_min] {
        out[i_mid] = ((out[i_mid] - out[i_min]) * target) / (out[i_max] - out[i_min]);
        out[i_max] = target;
    } else {
        out[i_mid] = 0.0;
        out[i_max] = 0.0;
    }
    out[i_min] = 0.0;
    return (out[0], out[1], out[2]);
}
