use flight_entity::Ref;
use flight_textformat::TextFormat;

use crate::text_shaper_run::shape_text_run;
use crate::types::*;

// The source's simplified bidi category.
#[derive(Clone, Copy, PartialEq, Eq)]
enum CodePointBidiClass {
    Ltr,
    Neutral,
    Rtl,
}

// JS `String.prototype.codePointAt` over UTF-16 code units: a surrogate pair decodes, a lone
// surrogate is its own code unit.
fn code_point_at(units: &[u16], i: usize) -> u32 {
    let first = u32::from(units[i]);
    if (0xd800..=0xdbff).contains(&first) && i + 1 < units.len() {
        let second = u32::from(units[i + 1]);
        if (0xdc00..=0xdfff).contains(&second) {
            return 0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00);
        }
    }
    return first;
}

fn get_code_point_bidi_class(code_point: u32) -> CodePointBidiClass {
    let in_range = |low: u32, high: u32| code_point >= low && code_point <= high;
    if in_range(0x0600, 0x06ff)
        || in_range(0x0750, 0x077f)
        || in_range(0x08a0, 0x08ff)
        || in_range(0xfb50, 0xfdff)
        || in_range(0xfe70, 0xfeff)
    {
        return CodePointBidiClass::Rtl;
    }
    if in_range(0x0590, 0x05ff) || in_range(0xfb1d, 0xfb4f) {
        return CodePointBidiClass::Rtl;
    }
    if in_range(0x0780, 0x083f) {
        return CodePointBidiClass::Rtl;
    }
    if in_range(0x0700, 0x074f) || in_range(0x0840, 0x085f) {
        return CodePointBidiClass::Rtl;
    }
    if in_range(0x0041, 0x005a) || in_range(0x0061, 0x007a) || in_range(0x0030, 0x0039) {
        return CodePointBidiClass::Ltr;
    }
    if in_range(0x00c0, 0x02ff) || in_range(0x0370, 0x04ff) || in_range(0x4e00, 0x9fff) {
        return CodePointBidiClass::Ltr;
    }
    return CodePointBidiClass::Neutral;
}

fn get_code_point_script(code_point: u32) -> &'static str {
    let in_range = |low: u32, high: u32| code_point >= low && code_point <= high;
    if in_range(0x0041, 0x007a) {
        return "Latn";
    }
    if in_range(0x00c0, 0x024f) {
        return "Latn";
    }
    if in_range(0x0370, 0x03ff) {
        return "Grek";
    }
    if in_range(0x0400, 0x04ff) {
        return "Cyrl";
    }
    if in_range(0x0590, 0x05ff) {
        return "Hebr";
    }
    if in_range(0x0600, 0x06ff) {
        return "Arab";
    }
    if in_range(0x0700, 0x074f) {
        return "Syrc";
    }
    if in_range(0x0900, 0x097f) {
        return "Deva";
    }
    if in_range(0x0e00, 0x0e7f) {
        return "Thai";
    }
    if in_range(0x3040, 0x309f) {
        return "Hira";
    }
    if in_range(0x30a0, 0x30ff) {
        return "Kana";
    }
    if in_range(0x4e00, 0x9fff) {
        return "Hans";
    }
    if in_range(0xac00, 0xd7af) {
        return "Hang";
    }
    return "Zyyy";
}

/// Splits `text` into contiguous runs sharing one script and direction, with UTF-16 code-unit offsets.
/// A built-in Unicode-property fallback (Latin/RTL detection and major script splits, not the full
/// bidi algorithm): neutral characters inherit the current run's direction and common-script
/// characters its script; `options.direction` is the base direction.
// flight-lint: allow(conform-params) Principal3139d09f D24: required first caller-owned item collection clears/fills retained capacity in original logical order
pub fn itemize_text(
    out: &mut Vec<TextItem>,
    text: &str,
    _format: &TextFormat,
    options: Option<&TextShaperOptions>,
) {
    out.clear();
    let units: Vec<u16> = text.encode_utf16().collect();
    if units.is_empty() {
        return;
    }
    let base_direction = options
        .and_then(|options| options.direction)
        .unwrap_or(TextDirection::LeftToRight);
    let mut run_start = 0;
    let mut run_script = String::new();
    let mut run_direction = base_direction;
    let mut i = 0;
    while i < units.len() {
        let code_point = code_point_at(&units, i);
        let char_len = if code_point > 0xffff { 2 } else { 1 };
        let char_script = get_code_point_script(code_point);
        let char_direction = match get_code_point_bidi_class(code_point) {
            CodePointBidiClass::Rtl => TextDirection::RightToLeft,
            CodePointBidiClass::Ltr => TextDirection::LeftToRight,
            CodePointBidiClass::Neutral => run_direction,
        };
        let effective_script = if char_script == "Zyyy" {
            if run_script.is_empty() {
                "Latn".to_string()
            } else {
                run_script.clone()
            }
        } else {
            char_script.to_string()
        };
        if i == 0 {
            run_script = effective_script;
            run_direction = char_direction;
        } else if effective_script != run_script || char_direction != run_direction {
            if i > run_start {
                out.push(TextItem {
                    direction: run_direction,
                    end: i,
                    script: run_script.clone(),
                    start: run_start,
                });
            }
            run_start = i;
            run_script = effective_script;
            run_direction = char_direction;
        }
        i += char_len;
    }
    if units.len() > run_start {
        out.push(TextItem {
            direction: run_direction,
            end: units.len(),
            script: run_script,
            start: run_start,
        });
    }
    return;
}

/// Itemizes `text` and shapes each item through the host with the item's direction (unspecified for
/// vertical) and script, returning the runs in logical order; empty for empty text or an
/// advances-only host.
pub fn shape_text_runs(
    host_text_shaper: &HostTextShaperCapability,
    text: &str,
    format: &TextFormat,
    options: Option<&TextShaperOptions>,
) -> Vec<Ref<ShapedRun>> {
    if text.is_empty() {
        return Vec::new();
    }
    let units: Vec<u16> = text.encode_utf16().collect();
    let mut result = Vec::new();
    let mut items = Vec::new();
    itemize_text(&mut items, text, format, options);
    for item in items {
        let sub = String::from_utf16_lossy(&units[item.start..item.end]);
        let run_options = ShapeRunOptions {
            direction: if item.direction == TextDirection::TopToBottom {
                None
            } else {
                Some(item.direction)
            },
            script: Some(item.script.clone()),
        };
        if let Some(run) = shape_text_run(host_text_shaper, &sub, format, Some(&run_options)) {
            result.push(run);
        }
    }
    return result;
}
