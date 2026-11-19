//! flight-compiler: target-native

mod wgpu_velocity_context {
    use flight_render_wgpu::WgpuVelocityContext;
    use flight_velocity::create_velocity_field;

    use crate::support::*;

    #[test]
    fn carries_a_u32_device_size_beyond_f32_precision_exactly() {
        // 16777217 device pixels has no f32 value: an f32 lane would hold 16777216, and the
        // clip-space mapping of the last pixel column would land on +1 instead of inside it.
        let mut state = create_wgpu_render_state_for_test(None);
        let field = create_velocity_field();
        let device_width = 16_777_217_u32;
        let ctx = WgpuVelocityContext {
            state: &mut state,
            field: &field,
            width: f64::from(device_width),
            height: 1.0,
            pixel_ratio: 1.0,
        };
        assert_eq!(ctx.width, 16_777_217.0);
        assert!((16_777_216.0 / ctx.width) * 2.0 - 1.0 < 1.0);
    }
}
