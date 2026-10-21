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

pub fn create_lift_gamma_gain_adjustment(lift: u32, gamma: u32, gain: u32) -> LiftGammaGainAdjustment {
    let mut out: LiftGammaGainAdjustment = allocate_entity();
    initialize_lift_gamma_gain_adjustment(&mut out, lift, gamma, gain);
    return out;
}

pub fn initialize_lift_gamma_gain_adjustment(out: &mut LiftGammaGainAdjustment, lift: u32, gamma: u32, gain: u32) {
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
