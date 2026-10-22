use flight_platform::PlatformEndianness;
use flight_render_wgpu::*;

mod explain_wgpu_uniform_endianness {
    use super::*;

    #[test]
    fn reports_the_host_endianness_and_validation_status() {
        let result = explain_wgpu_uniform_endianness();
        assert_eq!(result.endianness, PlatformEndianness::Little);
        assert_eq!(result.status, WgpuUniformEndiannessStatus::Validated);
    }
}
