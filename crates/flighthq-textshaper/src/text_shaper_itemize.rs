//! Text itemization: splits a string into contiguous runs that share a single
//! script and direction, then optionally shapes each run through the backend.
//!
//! This is a built-in Unicode-property fallback covering Latin/RTL detection and
//! major script splits. For full bidi correctness (Unicode Bidirectional
//! Algorithm), complex-script joining, and language-specific alternates, use a
//! full-glyph backend such as a future `flighthq-textshaper-harfbuzz`.

use flighthq_types::{ShapeDirection, ShapeRunOptions, ShapedRun, TextFormat};

use crate::text_shaper_run::shape_text_run;

/// A contiguous run of text sharing a single script and direction.
#[derive(Clone, Debug, PartialEq)]
pub struct TextItem {
    /// The text direction for this item.
    pub direction: TextItemDirection,
    /// End offset (exclusive) into the source string, in bytes.
    pub end: usize,
    /// ISO 15924 script tag (e.g. `"Latn"`, `"Arab"`).
    pub script: String,
    /// Start offset (inclusive) into the source string, in bytes.
    pub start: usize,
}

/// Direction of a text item. Mirrors the TS `TextDirection` union values used
/// in `TextItem`.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
pub enum TextItemDirection {
    LeftToRight,
    RightToLeft,
    TopToBottom,
}

/// Splits `text` into contiguous runs that share a single script and direction.
/// Each item carries start/end byte offsets into the original string, the
/// inferred ISO 15924 script tag, and the text direction.
///
/// The base direction from `base_direction` is used when no strong bidi
/// character is found.
pub fn itemize_text(
    text: &str,
    _format: &TextFormat,
    base_direction: Option<TextItemDirection>,
) -> Vec<TextItem> {
    if text.is_empty() {
        return Vec::new();
    }
    let base_dir = base_direction.unwrap_or(TextItemDirection::LeftToRight);
    let mut items: Vec<TextItem> = Vec::new();
    let mut run_start: usize = 0;
    let mut run_script = String::new();
    let mut run_direction = base_dir;
    let mut first = true;

    for (byte_offset, ch) in text.char_indices() {
        let code_point = ch as u32;
        let char_script = get_code_point_script(code_point);
        let char_bidi = get_code_point_bidi_class(code_point);

        let char_direction = match char_bidi {
            BidiClass::Rtl => TextItemDirection::RightToLeft,
            BidiClass::Ltr => TextItemDirection::LeftToRight,
            BidiClass::Neutral => run_direction,
        };

        // Resolve script: neutral/common characters inherit the current run's script.
        let effective_script = if char_script == "Zyyy" {
            if run_script.is_empty() {
                "Latn".to_string()
            } else {
                run_script.clone()
            }
        } else {
            char_script
        };

        if first {
            run_script = effective_script;
            run_direction = char_direction;
            first = false;
        } else if effective_script != run_script || char_direction != run_direction {
            // Script or direction changed: close current run.
            if byte_offset > run_start {
                items.push(TextItem {
                    direction: run_direction,
                    end: byte_offset,
                    script: run_script,
                    start: run_start,
                });
            }
            run_start = byte_offset;
            run_script = effective_script;
            run_direction = char_direction;
        }
    }

    // Close the final run.
    if text.len() > run_start {
        items.push(TextItem {
            direction: run_direction,
            end: text.len(),
            script: run_script,
            start: run_start,
        });
    }

    items
}

/// Itemizes `text` into script/direction runs and then shapes each run through
/// the active backend, returning a `Vec` of `ShapedRun`s in logical order.
/// Returns an empty `Vec` when no backend is registered or the backend is
/// advances-only (canvas tier).
pub fn shape_text_runs(
    text: &str,
    format: &TextFormat,
    base_direction: Option<TextItemDirection>,
) -> Vec<ShapedRun> {
    if text.is_empty() {
        return Vec::new();
    }
    let items = itemize_text(text, format, base_direction);
    let mut result: Vec<ShapedRun> = Vec::new();
    for item in &items {
        let sub = &text[item.start..item.end];
        let direction = match item.direction {
            TextItemDirection::LeftToRight => Some(ShapeDirection::LeftToRight),
            TextItemDirection::RightToLeft => Some(ShapeDirection::RightToLeft),
            TextItemDirection::TopToBottom => None,
        };
        let run_options = ShapeRunOptions {
            direction,
            script: Some(item.script.clone()),
        };
        if let Some(run) = shape_text_run(sub, format, Some(&run_options)) {
            result.push(run);
        }
    }
    result
}

// ---------------------------------------------------------------------------
// Internal Unicode property lookups
// ---------------------------------------------------------------------------

#[derive(PartialEq)]
enum BidiClass {
    Ltr,
    Rtl,
    Neutral,
}

fn get_code_point_bidi_class(cp: u32) -> BidiClass {
    // Arabic (U+0600-U+06FF, U+0750-U+077F, U+08A0-U+08FF, U+FB50-U+FDFF, U+FE70-U+FEFF)
    if (0x0600..=0x06ff).contains(&cp)
        || (0x0750..=0x077f).contains(&cp)
        || (0x08a0..=0x08ff).contains(&cp)
        || (0xfb50..=0xfdff).contains(&cp)
        || (0xfe70..=0xfeff).contains(&cp)
    {
        return BidiClass::Rtl;
    }
    // Hebrew (U+0590-U+05FF, U+FB1D-U+FB4F)
    if (0x0590..=0x05ff).contains(&cp) || (0xfb1d..=0xfb4f).contains(&cp) {
        return BidiClass::Rtl;
    }
    // Thaana, N'Ko, Samaritan (U+0780-U+083F)
    if (0x0780..=0x083f).contains(&cp) {
        return BidiClass::Rtl;
    }
    // Syriac (U+0700-U+074F), Mandaic (U+0840-U+085F)
    if (0x0700..=0x074f).contains(&cp) || (0x0840..=0x085f).contains(&cp) {
        return BidiClass::Rtl;
    }
    // ASCII letters/digits: LTR
    if (0x0041..=0x005a).contains(&cp)
        || (0x0061..=0x007a).contains(&cp)
        || (0x0030..=0x0039).contains(&cp)
    {
        return BidiClass::Ltr;
    }
    // Latin extended, Greek, Cyrillic, CJK: LTR
    if (0x00c0..=0x02ff).contains(&cp)
        || (0x0370..=0x04ff).contains(&cp)
        || (0x4e00..=0x9fff).contains(&cp)
    {
        return BidiClass::Ltr;
    }
    BidiClass::Neutral
}

fn get_code_point_script(cp: u32) -> String {
    if (0x0041..=0x007a).contains(&cp) {
        return "Latn".to_string();
    }
    if (0x00c0..=0x024f).contains(&cp) {
        return "Latn".to_string();
    }
    if (0x0370..=0x03ff).contains(&cp) {
        return "Grek".to_string();
    }
    if (0x0400..=0x04ff).contains(&cp) {
        return "Cyrl".to_string();
    }
    if (0x0590..=0x05ff).contains(&cp) {
        return "Hebr".to_string();
    }
    if (0x0600..=0x06ff).contains(&cp) {
        return "Arab".to_string();
    }
    if (0x0700..=0x074f).contains(&cp) {
        return "Syrc".to_string();
    }
    if (0x0900..=0x097f).contains(&cp) {
        return "Deva".to_string();
    }
    if (0x0e00..=0x0e7f).contains(&cp) {
        return "Thai".to_string();
    }
    if (0x3040..=0x309f).contains(&cp) {
        return "Hira".to_string();
    }
    if (0x30a0..=0x30ff).contains(&cp) {
        return "Kana".to_string();
    }
    if (0x4e00..=0x9fff).contains(&cp) {
        return "Hans".to_string();
    }
    if (0xac00..=0xd7af).contains(&cp) {
        return "Hang".to_string();
    }
    "Zyyy".to_string() // Common script
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use flighthq_types::{ShapedGlyph, TextShaperBackend};
    use serial_test::serial;

    use super::*;
    use crate::set_text_shaper_backend;

    struct TestShaper;
    impl TextShaperBackend for TestShaper {
        fn measure_text(&self, text: &str, _format: &TextFormat) -> f32 {
            text.len() as f32
        }
        fn shape_run(
            &self,
            text: &str,
            _format: &TextFormat,
            _options: Option<&ShapeRunOptions>,
        ) -> Option<ShapedRun> {
            let count = text.chars().count() as u32;
            Some(ShapedRun {
                advance_width: count as f32 * 8.0,
                direction: ShapeDirection::LeftToRight,
                font: None,
                glyph_count: count,
                glyphs: (0..count)
                    .map(|i| ShapedGlyph {
                        cluster: i,
                        glyph_id: i + 1,
                        x_advance: 8.0,
                        ..Default::default()
                    })
                    .collect(),
                script: "Latn".to_string(),
            })
        }
    }

    #[test]
    fn itemize_text_empty() {
        let items = itemize_text("", &TextFormat::default(), None);
        assert!(items.is_empty());
    }

    #[test]
    fn itemize_text_single_latin() {
        let items = itemize_text("hello", &TextFormat::default(), None);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].script, "Latn");
        assert_eq!(items[0].direction, TextItemDirection::LeftToRight);
        assert_eq!(items[0].start, 0);
        assert_eq!(items[0].end, 5);
    }

    #[test]
    fn itemize_text_arabic_is_rtl() {
        // Arabic text: U+0627 U+0644 U+0639 U+0631 U+0628 U+064A U+0629
        let text = "\u{0627}\u{0644}\u{0639}";
        let items = itemize_text(text, &TextFormat::default(), None);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].script, "Arab");
        assert_eq!(items[0].direction, TextItemDirection::RightToLeft);
    }

    #[test]
    fn itemize_text_mixed_scripts() {
        // Latin then Arabic.
        let text = "hi\u{0627}\u{0644}";
        let items = itemize_text(text, &TextFormat::default(), None);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].script, "Latn");
        assert_eq!(items[0].direction, TextItemDirection::LeftToRight);
        assert_eq!(items[1].script, "Arab");
        assert_eq!(items[1].direction, TextItemDirection::RightToLeft);
    }

    #[test]
    fn itemize_text_neutral_inherits_direction() {
        // Space between Latin chars should not split.
        let items = itemize_text("a b", &TextFormat::default(), None);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].script, "Latn");
    }

    #[test]
    #[serial]
    fn shape_text_runs_empty() {
        set_text_shaper_backend(Some(Arc::new(TestShaper)));
        let runs = shape_text_runs("", &TextFormat::default(), None);
        assert!(runs.is_empty());
        set_text_shaper_backend(None);
    }

    #[test]
    #[serial]
    fn shape_text_runs_single_script() {
        set_text_shaper_backend(Some(Arc::new(TestShaper)));
        let runs = shape_text_runs("hello", &TextFormat::default(), None);
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].glyph_count, 5);
        set_text_shaper_backend(None);
    }

    #[test]
    #[serial]
    fn shape_text_runs_returns_empty_without_backend() {
        set_text_shaper_backend(None);
        let runs = shape_text_runs("hello", &TextFormat::default(), None);
        assert!(runs.is_empty());
    }
}
