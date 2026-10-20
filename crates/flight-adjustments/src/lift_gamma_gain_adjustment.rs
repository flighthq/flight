/// Lift/gamma/gain as a LUT-tier adjustment (gamma is the nonlinear part). Packed-RGBA neutrals:
/// lift 0x000000ff, gamma 0x808080ff, gain 0xffffffff.
#[derive(Debug, Clone)]
pub struct LiftGammaGainAdjustment {
    pub lift: u32,
    pub gamma: u32,
    pub gain: u32,
}

impl Default for LiftGammaGainAdjustment {
    fn default() -> Self {
        return Self {
            lift: 0x000000ff,
            gamma: 0x808080ff,
            gain: 0xffffffff,
        };
    }
}

pub fn create_lift_gamma_gain_adjustment(lift: u32, gamma: u32, gain: u32) -> LiftGammaGainAdjustment {
    let mut out = LiftGammaGainAdjustment::default();
    initialize_lift_gamma_gain_adjustment(&mut out, lift, gamma, gain);
    return out;
}

pub fn initialize_lift_gamma_gain_adjustment(out: &mut LiftGammaGainAdjustment, lift: u32, gamma: u32, gain: u32) {
    out.lift = lift;
    out.gamma = gamma;
    out.gain = gain;
}
