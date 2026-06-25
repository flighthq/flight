//! LibGDX `.atlas` text format parser.
//!
//! Single-pass line-by-line parser. Handles single-page and multi-page atlases.
//! `rotate: true` regions are marked as `rotated` (90° clockwise in the atlas).
//! Animations are inferred from the standard `baseName_NNN` frame-naming
//! convention.

use flighthq_spritesheet::{
    SpritesheetAnimationData, SpritesheetData, SpritesheetFrameData,
    create_spritesheet_animation_data, create_spritesheet_data, create_spritesheet_frame_data,
};

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/// Options for [`parse_libgdx_atlas_spritesheet`].
#[derive(Clone, Debug)]
pub struct LibgdxAtlasParseOptions {
    /// Default duration (ms) per frame when building inferred animations.
    /// Defaults to `100`.
    pub frame_duration: f32,
}

impl Default for LibgdxAtlasParseOptions {
    fn default() -> Self {
        Self {
            frame_duration: 100.0,
        }
    }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
struct LibgdxPage {
    filename: String,
    height: f32,
    width: f32,
}

#[derive(Clone, Debug)]
struct LibgdxRegion {
    index: i64,
    name: String,
    offset_x: f32,
    offset_y: f32,
    rotated: bool,
    source_height: f32,
    source_width: f32,
    sprite_height: f32,
    sprite_width: f32,
    x: f32,
    y: f32,
}

impl Default for LibgdxRegion {
    fn default() -> Self {
        Self {
            index: -1,
            name: String::new(),
            offset_x: 0.0,
            offset_y: 0.0,
            rotated: false,
            source_height: 0.0,
            source_width: 0.0,
            sprite_height: 0.0,
            sprite_width: 0.0,
            x: 0.0,
            y: 0.0,
        }
    }
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Parses a LibGDX `.atlas` text string directly to a [`SpritesheetData`].
///
/// Single-pass line-by-line parser. Handles single-page and multi-page atlases.
/// `rotate: true` regions are marked as `rotated` (90° clockwise in the atlas).
/// Animations are inferred from the standard `baseName_NNN` frame-naming
/// convention.
pub fn parse_libgdx_atlas_spritesheet(
    text: &str,
    options: Option<&LibgdxAtlasParseOptions>,
) -> SpritesheetData {
    let frame_duration = options.map(|o| o.frame_duration).unwrap_or(100.0);
    let (pages, regions) = parse_libgdx_atlas(text);

    // Use the first page for top-level image metadata.
    let image_file = pages
        .first()
        .map(|p| p.filename.clone())
        .unwrap_or_default();
    let image_width = pages.first().map(|p| p.width).unwrap_or(0.0);
    let image_height = pages.first().map(|p| p.height).unwrap_or(0.0);

    let frames: Vec<SpritesheetFrameData> = regions.iter().map(region_to_frame).collect();
    let frame_names: Vec<String> = frames.iter().map(|f| f.name.clone()).collect();
    let animations = infer_animations(&frame_names, frame_duration);

    create_spritesheet_data(SpritesheetData {
        animations,
        frames,
        image_file,
        image_height,
        image_width,
        scale: 1.0,
    })
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/// Parse a `w,h` integer pair (`value.split(',')`, leading integer prefix).
fn parse_int_pair(value: &str) -> (f32, f32) {
    let mut parts = value.split(',');
    let a = parse_int_prefix(parts.next().unwrap_or("0"));
    let b = parse_int_prefix(parts.next().unwrap_or("0"));
    (a as f32, b as f32)
}

/// Mirror JS `parseInt(s, 10)`: leading integer (optionally signed), else 0.
fn parse_int_prefix(s: &str) -> i64 {
    let trimmed = s.trim();
    let bytes = trimmed.as_bytes();
    let mut i = 0;
    let mut sign = 1i64;
    if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
        if bytes[i] == b'-' {
            sign = -1;
        }
        i += 1;
    }
    let start = i;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if start == i {
        return 0;
    }
    trimmed[start..i]
        .parse::<i64>()
        .map(|v| sign * v)
        .unwrap_or(0)
}

/// Mirror the TS `isFilename`: `/[./]/.test(line) || /^\w+\.\w+$/.test(line)`.
fn is_filename(line: &str) -> bool {
    if line.contains('.') || line.contains('/') {
        return true;
    }
    // `^\w+\.\w+$` always requires a '.', already covered above; kept for fidelity.
    false
}

// The two page-push branches have identical bodies but distinct guard
// conditions; they mirror the TS atlas line-scan structure 1:1, so they are kept
// separate rather than collapsed.
#[allow(clippy::if_same_then_else)]
fn parse_libgdx_atlas(text: &str) -> (Vec<LibgdxPage>, Vec<LibgdxRegion>) {
    let mut pages: Vec<LibgdxPage> = Vec::new();
    let mut regions: Vec<LibgdxRegion> = Vec::new();

    let mut current_page: Option<usize> = None;
    let mut current_region: Option<LibgdxRegion> = None;

    for raw in split_lines(text) {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            // Blank line: commit any in-progress region.
            if let Some(region) = current_region.take() {
                regions.push(region);
            }
            continue;
        }

        let first = raw.chars().next();
        let is_indented = first == Some(' ') || first == Some('\t');

        if is_indented {
            // Key: value line belonging to current page header or current region.
            let Some(colon_idx) = trimmed.find(':') else {
                continue;
            };
            let key = trimmed[..colon_idx].trim();
            let value = trimmed[colon_idx + 1..].trim();

            if let Some(region) = current_region.as_mut() {
                match key {
                    "rotate" => region.rotated = value == "true",
                    "xy" => {
                        let (x, y) = parse_int_pair(value);
                        region.x = x;
                        region.y = y;
                    }
                    "size" => {
                        let (w, h) = parse_int_pair(value);
                        region.sprite_width = w;
                        region.sprite_height = h;
                    }
                    "orig" => {
                        let (sw, sh) = parse_int_pair(value);
                        region.source_width = sw;
                        region.source_height = sh;
                    }
                    "offset" => {
                        let (ox, oy) = parse_int_pair(value);
                        region.offset_x = ox;
                        region.offset_y = oy;
                    }
                    "index" => region.index = parse_int_prefix(value),
                    _ => {}
                }
            } else if let Some(page_idx) = current_page
                && key == "size"
            {
                let (w, h) = parse_int_pair(value);
                pages[page_idx].width = w;
                pages[page_idx].height = h;
            }
        } else {
            // Unindented non-empty line: page filename or region name.
            if let Some(region) = current_region.take() {
                regions.push(region);
            }

            let same_as_current = current_page
                .map(|idx| pages[idx].filename == trimmed)
                .unwrap_or(false);

            if is_filename(trimmed) && current_page.is_none() {
                pages.push(LibgdxPage {
                    filename: trimmed.to_string(),
                    height: 0.0,
                    width: 0.0,
                });
                current_page = Some(pages.len() - 1);
            } else if is_filename(trimmed) && current_page.is_some() && !same_as_current {
                pages.push(LibgdxPage {
                    filename: trimmed.to_string(),
                    height: 0.0,
                    width: 0.0,
                });
                current_page = Some(pages.len() - 1);
            } else {
                // Region name.
                if current_page.is_none() {
                    pages.push(LibgdxPage::default());
                    current_page = Some(pages.len() - 1);
                }
                current_region = Some(LibgdxRegion {
                    name: trimmed.to_string(),
                    ..Default::default()
                });
            }
        }
    }

    // Commit trailing region.
    if let Some(region) = current_region.take() {
        regions.push(region);
    }

    (pages, regions)
}

/// Split on `\r?\n`, preserving leading whitespace (used for the indent test).
fn split_lines(text: &str) -> Vec<&str> {
    text.split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .collect()
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn region_to_frame(region: &LibgdxRegion) -> SpritesheetFrameData {
    let source_width = if region.source_width > 0.0 {
        region.source_width
    } else {
        region.sprite_width
    };
    let source_height = if region.source_height > 0.0 {
        region.source_height
    } else {
        region.sprite_height
    };

    create_spritesheet_frame_data(SpritesheetFrameData {
        height: region.sprite_height,
        name: region.name.clone(),
        offset_x: region.offset_x,
        offset_y: region.offset_y,
        pivot_x: None,
        pivot_y: None,
        rotated: region.rotated,
        source_height,
        source_width,
        width: region.sprite_width,
        x: region.x,
        y: region.y,
    })
}

/// Infer animations from frame names using the `baseName_NNN` convention.
/// Frames whose names do not end in a numeric suffix are left standalone.
/// Mirrors the TS `Map`-ordered grouping over `\.\w+$` + `^(.*?)_?(\d+)$`.
fn infer_animations(frame_names: &[String], frame_duration: f32) -> Vec<SpritesheetAnimationData> {
    let mut order: Vec<String> = Vec::new();
    let mut groups: Vec<(String, Vec<(i64, String)>)> = Vec::new();

    for name in frame_names {
        let Some((base, index)) = split_base_and_index(name) else {
            continue;
        };
        if let Some(pos) = order.iter().position(|b| *b == base) {
            groups[pos].1.push((index, name.clone()));
        } else {
            order.push(base.clone());
            groups.push((base, vec![(index, name.clone())]));
        }
    }

    let mut animations = Vec::new();
    for (base, mut entries) in groups {
        if entries.len() < 2 {
            continue;
        }
        entries.sort_by_key(|(index, _)| *index);
        animations.push(create_spritesheet_animation_data(
            SpritesheetAnimationData {
                frame_duration,
                frame_names: entries.into_iter().map(|(_, name)| name).collect(),
                loop_: true,
                name: base,
                ..Default::default()
            },
        ));
    }
    animations
}

/// Strip a trailing `.ext` then split a trailing numeric suffix, mirroring the
/// TS regexes `\.\w+$` and `^(.*?)_?(\d+)$`. Returns `(base, index)` or `None`.
fn split_base_and_index(name: &str) -> Option<(String, i64)> {
    let no_ext = strip_extension(name);
    let chars: Vec<char> = no_ext.chars().collect();
    let mut digit_start = chars.len();
    while digit_start > 0 && chars[digit_start - 1].is_ascii_digit() {
        digit_start -= 1;
    }
    if digit_start == chars.len() {
        return None;
    }
    let num_str: String = chars[digit_start..].iter().collect();
    let index = num_str.parse::<i64>().ok()?;
    let mut base_end = digit_start;
    if base_end > 0 && chars[base_end - 1] == '_' {
        base_end -= 1;
    }
    let base: String = chars[..base_end].iter().collect();
    Some((base, index))
}

/// Remove a trailing `.word` extension (`\.\w+$`).
fn strip_extension(name: &str) -> &str {
    if let Some(dot) = name.rfind('.') {
        let ext = &name[dot + 1..];
        if !ext.is_empty() && ext.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return &name[..dot];
        }
    }
    name
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Page-header attributes (size/format/…) are indented, matching the
    // TS parser's `isIndented` page-attribute branch; region attributes are
    // likewise indented. The bare unindented lines are page filenames and
    // region names.
    const ATLAS: &str = "atlas.png\n  size: 256,128\n  format: RGBA8888\n  filter: Linear,Linear\n  repeat: none\nhero_01\n  rotate: false\n  xy: 0, 0\n  size: 60, 56\n  orig: 64, 64\n  offset: 2, 4\n  index: -1\nhero_02\n  rotate: false\n  xy: 60, 0\n  size: 60, 56\n  orig: 64, 64\n  offset: 2, 4\n  index: -1\nspark\n  rotate: true\n  xy: 120, 0\n  size: 16, 16\n  orig: 16, 16\n  offset: 0, 0\n  index: -1\n";

    // parse_libgdx_atlas_spritesheet

    #[test]
    fn parse_libgdx_atlas_spritesheet_basic() {
        let data = parse_libgdx_atlas_spritesheet(ATLAS, None);
        assert_eq!(data.image_file, "atlas.png");
        assert_eq!(data.image_width, 256.0);
        assert_eq!(data.image_height, 128.0);
        assert_eq!(data.frames.len(), 3);

        let hero = &data.frames[0];
        assert_eq!(hero.name, "hero_01");
        assert_eq!(hero.x, 0.0);
        assert_eq!(hero.y, 0.0);
        assert_eq!(hero.width, 60.0);
        assert_eq!(hero.height, 56.0);
        assert_eq!(hero.source_width, 64.0);
        assert_eq!(hero.source_height, 64.0);
        assert_eq!(hero.offset_x, 2.0);
        assert_eq!(hero.offset_y, 4.0);
        assert!(!hero.rotated);
    }

    #[test]
    fn parse_libgdx_atlas_spritesheet_rotated_flag() {
        let data = parse_libgdx_atlas_spritesheet(ATLAS, None);
        let spark = data.frames.iter().find(|f| f.name == "spark").unwrap();
        assert!(spark.rotated);
    }

    #[test]
    fn parse_libgdx_atlas_spritesheet_infers_animations() {
        let data = parse_libgdx_atlas_spritesheet(ATLAS, None);
        let hero = data.animations.iter().find(|a| a.name == "hero").unwrap();
        assert_eq!(hero.frame_names.len(), 2);
        assert_eq!(hero.frame_names[0], "hero_01");
        assert_eq!(hero.frame_names[1], "hero_02");
        assert_eq!(hero.frame_duration, 100.0);
        // spark is standalone (single frame), no animation.
        assert!(data.animations.iter().all(|a| a.name != "spark"));

        let custom = parse_libgdx_atlas_spritesheet(
            ATLAS,
            Some(&LibgdxAtlasParseOptions {
                frame_duration: 250.0,
            }),
        );
        assert_eq!(custom.animations[0].frame_duration, 250.0);
    }
}
