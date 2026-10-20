use crate::create_channel_mixer_color_matrix;

/// Channel mixer as a matrix-tier adjustment. `matrix` is a 3x4 row-major RGB->RGB mix
/// plus a per-row normalized-linear bias.
#[derive(Debug, Clone)]
pub struct ChannelMixerAdjustment {
    pub matrix: [f32; 12],
    pub color_matrix: [f32; 20],
}

impl Default for ChannelMixerAdjustment {
    fn default() -> Self {
        return Self {
            matrix: IDENTITY_CHANNEL_MIXER,
            color_matrix: [0.0; 20],
        };
    }
}

pub const IDENTITY_CHANNEL_MIXER: [f32; 12] = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0];

pub fn create_channel_mixer_adjustment(matrix: [f32; 12]) -> ChannelMixerAdjustment {
    let mut out = ChannelMixerAdjustment::default();
    initialize_channel_mixer_adjustment(&mut out, matrix);
    return out;
}

pub fn initialize_channel_mixer_adjustment(out: &mut ChannelMixerAdjustment, matrix: [f32; 12]) {
    let m = |i: usize| -> f32 { matrix[i] };
    let mut color_matrix = create_channel_mixer_color_matrix(
        &[m(0), m(1), m(2)],
        &[m(4), m(5), m(6)],
        &[m(8), m(9), m(10)],
    );
    color_matrix[4] = m(3);
    color_matrix[9] = m(7);
    color_matrix[14] = m(11);
    out.matrix = matrix;
    out.color_matrix = color_matrix;
}
