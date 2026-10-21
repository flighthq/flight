use flight_entity::allocate_entity;

use crate::contract::AdjustmentFields;
use crate::contract::initialize_color_matrix_adjustment;
use crate::contract::create_channel_mixer_color_matrix;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_channel_mixer_adjustment() {
        let a = ChannelMixerAdjustment::new(Some(&ChannelMixerAdjustmentOptions { matrix: [0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0] }));
        let b = create_channel_mixer_adjustment(Some(&ChannelMixerAdjustmentOptions { matrix: [0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0] }));
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.color_matrix, b.color_matrix);
    }
}

/// Channel mixer as a matrix-tier adjustment. `matrix` is a 3x4 row-major RGB->RGB mix
/// plus a per-row normalized-linear bias.
#[derive(Debug, Clone)]
pub struct ChannelMixerAdjustment {
    fields: AdjustmentFields,
    pub matrix: [f32; 12],
}

pub const IDENTITY_CHANNEL_MIXER: [f32; 12] = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0];

/// Options for `create_channel_mixer_adjustment` (TS: the options object). Omitted options mean the identity mix.
#[derive(Debug, Clone, Default)]
pub struct ChannelMixerAdjustmentOptions {
    pub matrix: [f32; 12],
}

pub fn create_channel_mixer_adjustment(options: Option<&ChannelMixerAdjustmentOptions>) -> ChannelMixerAdjustment {
    let mut out: ChannelMixerAdjustment = allocate_entity();
    initialize_channel_mixer_adjustment(&mut out, options);
    return out;
}

pub fn initialize_channel_mixer_adjustment(out: &mut ChannelMixerAdjustment, options: Option<&ChannelMixerAdjustmentOptions>) {
    let matrix = options.map_or(IDENTITY_CHANNEL_MIXER, |o| o.matrix);
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
    initialize_color_matrix_adjustment(out, "ChannelMixerAdjustment", color_matrix);
}

impl Default for ChannelMixerAdjustment {
    fn default() -> Self {
        return Self {
            fields: AdjustmentFields::default(),
            matrix: IDENTITY_CHANNEL_MIXER,
        };
    }
}

impl ChannelMixerAdjustment {
    pub fn new(options: Option<&ChannelMixerAdjustmentOptions>) -> Self {
        return create_channel_mixer_adjustment(options);
    }
}

crate::impl_adjustment!(ChannelMixerAdjustment, "matrix" => matrix);
