use flight_adjustments::contract::*;
use flight_entity::allocate_entity;

mod create_channel_mixer_adjustment {
    use super::*;

    #[test]
    fn rotates_channels_via_a_3x4_row_major_mix_and_carries_the_fusable_kind() {
        // R<-B, G<-R, B<-G -- the same mix the functional scene uses.
        let adjustment = create_channel_mixer_adjustment(Some(&ChannelMixerAdjustmentOptions { matrix: [0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0] }));
        assert_eq!(get_adjustment_kind(&Adjustment::ChannelMixer(adjustment.clone())), "ChannelMixerAdjustment");
        assert_eq!(adjustment.color_matrix.len(), 20);
        // 0xAABBCC -> R'=CC (from blue), G'=AA (from red), B'=BB (from green); alpha preserved.
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix, 0xaabbccff), 0xccaabbff);
    }

    #[test]
    fn defaults_to_the_identity_mix() {
        let adjustment = create_channel_mixer_adjustment(None);
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix, 0x123456ff), 0x123456ff);
    }

    #[test]
    fn applies_the_per_row_offset_in_normalized_0_1_scaled_to_the_0_255_column() {
        // Identity mix plus a full-white offset on every row -> saturates to white.
        let adjustment = create_channel_mixer_adjustment(Some(&ChannelMixerAdjustmentOptions { matrix: [1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0] }));
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix, 0x102030ff), 0xffffffff);
    }
}

mod initialize_channel_mixer_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_channel_mixer_adjustment() {
        let mut out: ChannelMixerAdjustment = allocate_entity();
        initialize_channel_mixer_adjustment(&mut out, Some(&ChannelMixerAdjustmentOptions { matrix: IDENTITY_CHANNEL_MIXER }));
        assert_eq!(apply_color_matrix_to_color(&out.color_matrix, 0x123456ff), 0x123456ff);
    }
}
