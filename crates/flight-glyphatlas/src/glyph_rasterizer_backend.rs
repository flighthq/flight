use std::sync::Arc;

use flight_font::{GlyphRasterizedBitmap, HostGlyphRasterizerCapability};

pub fn initialize_stub_glyph_rasterizer_backend(out: &mut HostGlyphRasterizerCapability) {
    out.measure_metrics = None;
    out.rasterize = Arc::new(|_codepoint, options| {
        let size = (options.font_size.round() as u32).max(1);
        let width = ((size as f32 * 0.6).round() as u32).max(1);
        let height = ((size as f32 * 0.7).round() as u32).max(1);
        let pixels = vec![255; width as usize * height as usize * 4].into_boxed_slice();
        return Some(GlyphRasterizedBitmap {
            advance: (width + ((size as f32 * 0.1).round() as u32).max(1)) as f32,
            bearing_x: 0,
            bearing_y: height as i32,
            height,
            pixels,
            width,
        });
    });
}

pub fn allocate_stub_glyph_rasterizer_backend() -> HostGlyphRasterizerCapability {
    let mut out = HostGlyphRasterizerCapability {
        measure_metrics: None,
        provider: Arc::new(()),
        rasterize: Arc::new(|_codepoint, _options| None),
    };
    initialize_stub_glyph_rasterizer_backend(&mut out);
    return out;
}
