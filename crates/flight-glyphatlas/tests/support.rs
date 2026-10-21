use std::sync::{Arc, Mutex};

use flight_font::{GlyphRasterizedBitmap, HostGlyphRasterizerCapability};
use flight_glyphatlas::GlyphAtlasOptions;

pub struct MockRasterizer {
    pub backend: HostGlyphRasterizerCapability,
    pub calls: Arc<Mutex<Vec<u32>>>,
}

pub fn atlas_options(
    backend: HostGlyphRasterizerCapability,
    width: u32,
    height: u32,
) -> GlyphAtlasOptions {
    return GlyphAtlasOptions {
        font_family: "mock".to_string(),
        font_size: 16.0,
        font_style: None,
        font_weight: None,
        height,
        max_area: None,
        max_bytes: None,
        max_glyphs: None,
        padding: None,
        rasterizer_backend: backend,
        width,
    };
}

pub fn backend_producing(width: u32, height: u32) -> HostGlyphRasterizerCapability {
    return mock_rasterizer(move |_codepoint| (width, height)).backend;
}

pub fn mock_rasterizer(
    size_for: impl Fn(u32) -> (u32, u32) + Send + Sync + 'static,
) -> MockRasterizer {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let callback_calls = calls.clone();
    let backend = HostGlyphRasterizerCapability {
        measure_metrics: None,
        provider: Arc::new(()),
        rasterize: Arc::new(move |codepoint, _options| {
            callback_calls.lock().unwrap().push(codepoint);
            let (width, height) = size_for(codepoint);
            let mut pixels = vec![0; width as usize * height as usize * 4].into_boxed_slice();
            for pixel in pixels.chunks_exact_mut(4) {
                pixel[0] = codepoint as u8;
                pixel[1] = 0x80;
                pixel[2] = 0x40;
                pixel[3] = 0xff;
            }
            return Some(GlyphRasterizedBitmap {
                advance: width as f32,
                bearing_x: 1,
                bearing_y: height as i32,
                height,
                pixels,
                width,
            });
        }),
    };
    return MockRasterizer { backend, calls };
}

pub fn null_backend() -> HostGlyphRasterizerCapability {
    return HostGlyphRasterizerCapability {
        measure_metrics: None,
        provider: Arc::new(()),
        rasterize: Arc::new(|_codepoint, _options| None),
    };
}
