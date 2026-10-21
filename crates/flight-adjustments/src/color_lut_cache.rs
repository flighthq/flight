use flight_entity::{EntityRuntimeSlot, allocate_entity};
use crate::contract::Adjustment;
use crate::contract::ColorLut;
use crate::contract::bake_color_lut;
use crate::contract::get_adjustment_color_transform;

/// Bake memo for the LUT-tier fuse: caches a baked ColorLut keyed by the run's content signature.
#[derive(Debug, Clone)]
pub struct ColorLutCache {
    runtime: EntityRuntimeSlot,
    pub signature: Option<String>,
    pub lut: Option<ColorLut>,
}

pub fn create_color_lut_cache() -> ColorLutCache {
    let mut out: ColorLutCache = allocate_entity();
    initialize_color_lut_cache(&mut out);
    return out;
}

pub fn initialize_color_lut_cache(out: &mut ColorLutCache) {
    out.signature = None;
    out.lut = None;
}

fn adjustment_signature(adjustment: &Adjustment) -> String {
    return match adjustment {
        Adjustment::BrightnessContrast(a) => {
            format!("{{\"kind\":\"BrightnessContrastAdjustment\",\"brightness\":{},\"contrast\":{}}}", a.brightness, a.contrast)
        }
        Adjustment::ChannelMixer(a) => {
            format!("{{\"kind\":\"ChannelMixerAdjustment\",\"matrix\":{:?}}}", a.matrix)
        }
        Adjustment::ColorBlindSimulation(a) => {
            format!("{{\"kind\":\"ColorBlindSimulationAdjustment\",\"type\":\"{:?}\"}}", a.color_blind_type)
        }
        Adjustment::ColorGrade(a) => {
            format!("{{\"kind\":\"ColorGradeAdjustment\",\"exposure\":{},\"brightness\":{},\"contrast\":{},\"saturation\":{},\"temperature\":{},\"tint\":{},\"lift\":{},\"gamma\":{},\"gain\":{}}}",
                a.exposure, a.brightness, a.contrast, a.saturation, a.temperature, a.tint, a.lift, a.gamma, a.gain)
        }
        Adjustment::ColorMatrix(a) => {
            format!("{{\"kind\":\"ColorMatrixAdjustment\",\"colorMatrix\":{:?}}}", &a.color_matrix[..])
        }
        Adjustment::ColorScaleBias(a) => {
            format!("{{\"kind\":\"ColorScaleBiasAdjustment\",\"redScale\":{},\"greenScale\":{},\"blueScale\":{},\"alphaScale\":{},\"redBias\":{},\"greenBias\":{},\"blueBias\":{},\"alphaBias\":{}}}",
                a.color_scale_bias.red_scale, a.color_scale_bias.green_scale, a.color_scale_bias.blue_scale, a.color_scale_bias.alpha_scale,
                a.color_scale_bias.red_bias, a.color_scale_bias.green_bias, a.color_scale_bias.blue_bias, a.color_scale_bias.alpha_bias)
        }
        Adjustment::Exposure(a) => {
            format!("{{\"kind\":\"ExposureAdjustment\",\"exposure\":{}}}", a.exposure)
        }
        Adjustment::Grayscale(a) => {
            format!("{{\"kind\":\"GrayscaleAdjustment\",\"intensity\":{}}}", a.intensity)
        }
        Adjustment::HueSaturation(a) => {
            format!("{{\"kind\":\"HueSaturationAdjustment\",\"hue\":{},\"saturation\":{},\"lightness\":{}}}", a.hue, a.saturation, a.lightness)
        }
        Adjustment::Invert(a) => {
            format!("{{\"kind\":\"InvertAdjustment\",\"intensity\":{}}}", a.intensity)
        }
        Adjustment::LiftGammaGain(a) => {
            format!("{{\"kind\":\"LiftGammaGainAdjustment\",\"lift\":{},\"gamma\":{},\"gain\":{}}}", a.lift, a.gamma, a.gain)
        }
        Adjustment::LookupTableGrade(a) => {
            format!("{{\"kind\":\"LookupTableGradeAdjustment\",\"strength\":{}}}", a.strength)
        }
        Adjustment::Sepia(a) => {
            format!("{{\"kind\":\"SepiaAdjustment\",\"intensity\":{}}}", a.intensity)
        }
        Adjustment::Tint(a) => {
            format!("{{\"kind\":\"TintAdjustment\",\"colorMatrix\":{:?}}}", &a.color_matrix[..])
        }
    };
}

/// Bakes the fused ColorLut for a pointwise-adjustment run, reusing the cache when the run's
/// content signature is unchanged. On a hit the exact same ColorLut reference is returned; on a miss
/// the run's transforms are composed and baked afresh.
pub fn bake_color_lut_for_run(cache: &mut ColorLutCache, run: &[Adjustment], size: u32) -> ColorLut {
    let signature = color_lut_run_signature(run, size);
    if cache.signature.as_deref() == Some(&signature) && cache.lut.is_some() {
        return cache.lut.clone().unwrap();
    }
    let transformable: Vec<Adjustment> = run
        .iter()
        .filter(|a| get_adjustment_color_transform(a))
        .cloned()
        .collect();
    let lut = bake_color_lut(&transformable, size);
    cache.signature = Some(signature);
    cache.lut = Some(lut.clone());
    return lut;
}

/// Content signature of a run for cache keying: the per-axis size plus each op's serialized data fields.
fn color_lut_run_signature(run: &[Adjustment], size: u32) -> String {
    let mut sig = format!("{}\n[", size);
    for (i, adj) in run.iter().enumerate() {
        if i > 0 {
            sig.push(',');
        }
        sig.push_str(&adjustment_signature(adj));
    }
    sig.push(']');
    return sig;
}

impl Default for ColorLutCache {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            signature: None,
            lut: None,
        };
    }
}

flight_entity::impl_entity!(ColorLutCache);
