use std::sync::Arc;

use flight_entity::Ref;
use flight_textformat::TextFormat;
use flight_textshaper::contract::*;

/// A host implementing only the required member (partial support declared by absence).
pub fn advances_only(measure: fn(&str) -> f32) -> HostTextShaperCapability {
    return HostTextShaperCapability {
        provider: Arc::new(()),
        get_code_point_for_glyph: None,
        get_font_metrics: None,
        get_glyph_extents: None,
        get_glyph_index_for_code_point: None,
        get_glyph_name: None,
        measure_text: Arc::new(move |text, _format| measure(text)),
        shape_run: None,
    };
}

pub fn format() -> TextFormat {
    let make: fn() -> TextFormat = TextFormat::default;
    return make();
}

pub fn sized(size: f32) -> TextFormat {
    let mut format = format();
    format.size = Some(size);
    return format;
}

/// A run built like the source's object literals.
pub fn run(advance_width: f32, glyphs: Vec<ShapedGlyph>, script: &str) -> Ref<ShapedRun> {
    let run = create_shaped_run();
    {
        let mut out = run.write().unwrap();
        out.advance_width = advance_width;
        out.glyph_count = glyphs.len();
        out.glyphs = glyphs;
        out.script = script.to_string();
    }
    return run;
}

pub fn glyph(cluster: i32, glyph_id: i32, x_advance: f32, x_offset: f32) -> ShapedGlyph {
    return ShapedGlyph {
        cluster,
        glyph_id,
        x_advance,
        x_offset,
        y_advance: 0.0,
        y_offset: 0.0,
    };
}
