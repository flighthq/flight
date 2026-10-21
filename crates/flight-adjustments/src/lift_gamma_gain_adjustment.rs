use flight_entity::{EntityRuntimeSlot, allocate_entity};

/// Lift/gamma/gain as a LUT-tier adjustment (gamma is the nonlinear part). Packed-RGBA neutrals:
/// lift 0x000000ff, gamma 0x808080ff, gain 0xffffffff.
#[derive(Debug, Clone)]
pub struct LiftGammaGainAdjustment {
    runtime: EntityRuntimeSlot,
    pub lift: u32,
    pub gamma: u32,
    pub gain: u32,
}

/// Options for `create_lift_gamma_gain_adjustment` (TS: the options object). Every field is optional; defaults apply inside.
#[derive(Debug, Clone, Default)]
pub struct LiftGammaGainAdjustmentOptions {
    pub lift: Option<u32>,
    pub gamma: Option<u32>,
    pub gain: Option<u32>,
}

pub fn create_lift_gamma_gain_adjustment(options: Option<&LiftGammaGainAdjustmentOptions>) -> LiftGammaGainAdjustment {
    let mut out: LiftGammaGainAdjustment = allocate_entity();
    initialize_lift_gamma_gain_adjustment(&mut out, options);
    return out;
}

pub fn initialize_lift_gamma_gain_adjustment(out: &mut LiftGammaGainAdjustment, options: Option<&LiftGammaGainAdjustmentOptions>) {
    let lift = options.and_then(|o| o.lift).unwrap_or(0x000000ff);
    let gamma = options.and_then(|o| o.gamma).unwrap_or(0x808080ff);
    let gain = options.and_then(|o| o.gain).unwrap_or(0xffffffff);
    out.lift = lift;
    out.gamma = gamma;
    out.gain = gain;
}

impl Default for LiftGammaGainAdjustment {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            lift: 0x000000ff,
            gamma: 0x808080ff,
            gain: 0xffffffff,
        };
    }
}

flight_entity::impl_entity!(LiftGammaGainAdjustment);
