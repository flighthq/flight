use crate::resource::FontResource;

/// Text direction for a shaped run. Mirrors the TS `'LeftToRight' | 'RightToLeft'` union.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ShapeDirection {
    #[default]
    LeftToRight,
    RightToLeft,
}

/// A single shaped glyph: its id, cluster mapping, advances, and offsets.
#[derive(Copy, Clone, Debug, Default, PartialEq)]
pub struct ShapedGlyph {
    pub cluster: u32,
    pub glyph_id: u32,
    pub x_advance: f32,
    pub x_offset: f32,
    pub y_advance: f32,
    pub y_offset: f32,
}

/// A shaped text run — per-glyph ids, advances, and offsets produced by a full-glyph shaper.
#[derive(Clone, Debug, Default)]
pub struct ShapedRun {
    pub advance_width: f32,
    pub direction: ShapeDirection,
    pub font: Option<FontResource>,
    pub glyph_count: u32,
    pub glyphs: Vec<ShapedGlyph>,
    pub script: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shaped_run_defaults_to_empty_left_to_right_run() {
        let run = ShapedRun::default();
        assert_eq!(run.direction, ShapeDirection::LeftToRight);
        assert_eq!(run.advance_width, 0.0);
        assert_eq!(run.glyph_count, 0);
        assert!(run.glyphs.is_empty());
        assert!(run.font.is_none());
        assert_eq!(run.script, "");
    }
}
