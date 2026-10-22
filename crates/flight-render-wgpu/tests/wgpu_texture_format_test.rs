use flight_render_wgpu::*;

const KNOWN_FORMATS: [(&str, wgpu::TextureFormat); 7] = [
    ("bgra8unorm", wgpu::TextureFormat::Bgra8Unorm),
    ("bgra8unorm-srgb", wgpu::TextureFormat::Bgra8UnormSrgb),
    ("rgba8unorm", wgpu::TextureFormat::Rgba8Unorm),
    ("rgba8unorm-srgb", wgpu::TextureFormat::Rgba8UnormSrgb),
    ("rgba16float", wgpu::TextureFormat::Rgba16Float),
    ("rgba32float", wgpu::TextureFormat::Rgba32Float),
    (
        "depth24plus-stencil8",
        wgpu::TextureFormat::Depth24PlusStencil8,
    ),
];

mod get_wgpu_texture_format {
    use super::*;

    #[test]
    fn maps_every_webgpu_format_name_the_backend_uses_to_its_native_format() {
        for (name, format) in KNOWN_FORMATS {
            assert_eq!(get_wgpu_texture_format(name), Some(format), "{name}");
        }
    }

    #[test]
    fn round_trips_through_the_format_name() {
        for (name, _) in KNOWN_FORMATS {
            let format = get_wgpu_texture_format(name).expect("a known format name");
            assert_eq!(get_wgpu_texture_format_name(format), name);
        }
    }

    #[test]
    fn returns_none_for_a_name_the_backend_does_not_use() {
        assert_eq!(get_wgpu_texture_format("rgb10a2unorm"), None);
        assert_eq!(get_wgpu_texture_format("unknown"), None);
        assert_eq!(get_wgpu_texture_format(""), None);
    }

    #[test]
    fn matches_names_exactly_without_case_folding() {
        assert_eq!(get_wgpu_texture_format("BGRA8UNORM"), None);
        assert_eq!(get_wgpu_texture_format(" rgba8unorm"), None);
    }
}

mod get_wgpu_texture_format_name {
    use super::*;

    #[test]
    fn names_every_native_format_the_backend_presents_or_allocates() {
        for (name, format) in KNOWN_FORMATS {
            assert_eq!(get_wgpu_texture_format_name(format), name);
        }
    }

    #[test]
    fn round_trips_through_the_native_format() {
        for (_, format) in KNOWN_FORMATS {
            let name = get_wgpu_texture_format_name(format);
            assert_eq!(get_wgpu_texture_format(name), Some(format));
        }
    }

    #[test]
    fn reports_unknown_for_a_format_the_backend_never_allocates() {
        assert_eq!(
            get_wgpu_texture_format_name(wgpu::TextureFormat::R8Unorm),
            "unknown"
        );
        assert_eq!(
            get_wgpu_texture_format_name(wgpu::TextureFormat::Depth32Float),
            "unknown"
        );
        assert_eq!(get_wgpu_texture_format("unknown"), None);
    }
}
