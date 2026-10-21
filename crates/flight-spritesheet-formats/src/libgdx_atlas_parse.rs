use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_spritesheet::{SpritesheetData, SpritesheetDataOptions, create_spritesheet_data};
use flight_textureatlas::TextureAtlas;
use flight_textureatlas_formats::parse_texture_atlas_libgdx_atlas;

use crate::common::{frame_from_region, infer_animations};
use crate::types::*;

#[derive(Clone, Debug, Default)]
struct LibgdxPage {
    filename: String,
    height: f32,
    width: f32,
}

pub fn parse_libgdx_atlas_spritesheet(
    text: &str,
    options: Option<&LibgdxAtlasParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> SpritesheetData {
    let pages = z_a_parse_libgdx_pages(text);
    let first_page = pages.first();
    if first_page.is_some_and(|page| page.filename.is_empty()) {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "spritesheet.libgdx-atlas.missing-page-header",
            "parseLibgdxAtlasSpritesheet",
            None,
        );
    }
    let mut atlas = TextureAtlas::default();
    parse_texture_atlas_libgdx_atlas(&mut atlas, text);
    let frames = atlas
        .regions
        .iter()
        .map(|region| frame_from_region(&region.read().unwrap(), false))
        .collect::<Vec<_>>();
    let frame_names = frames
        .iter()
        .map(|frame| frame.name.clone())
        .collect::<Vec<_>>();
    let frame_duration = options
        .and_then(|options| options.frame_duration)
        .unwrap_or(100.0);
    return create_spritesheet_data(Some(SpritesheetDataOptions {
        animations: Some(infer_animations(&frame_names, frame_duration)),
        frames: Some(frames),
        image_file: Some(first_page.map_or_else(String::new, |page| page.filename.clone())),
        image_height: Some(first_page.map_or(0.0, |page| page.height)),
        image_width: Some(first_page.map_or(0.0, |page| page.width)),
        scale: Some(1.0),
    }));
}

fn z_a_parse_libgdx_pages(text: &str) -> Vec<LibgdxPage> {
    let mut pages: Vec<LibgdxPage> = Vec::new();
    let mut current_page: Option<usize> = None;
    let mut in_region = false;
    for raw in text.lines() {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            in_region = false;
            continue;
        }
        let indented = raw.starts_with(' ') || raw.starts_with('\t');
        if indented {
            let Some(colon) = trimmed.find(':') else {
                continue;
            };
            let key = trimmed[..colon].trim();
            let value = trimmed[colon + 1..].trim();
            if !in_region && key == "size" {
                let (width, height) = z_c_parse_int_pair(value);
                if let Some(page) = current_page.and_then(|index| pages.get_mut(index)) {
                    page.width = width;
                    page.height = height;
                }
            }
            continue;
        }
        if z_b_is_filename(trimmed)
            && current_page.map_or(true, |index| pages[index].filename != trimmed)
        {
            pages.push(LibgdxPage {
                filename: trimmed.to_string(),
                height: 0.0,
                width: 0.0,
            });
            current_page = Some(pages.len() - 1);
            in_region = false;
        } else {
            if current_page.is_none() {
                pages.push(LibgdxPage::default());
                current_page = Some(0);
            }
            in_region = true;
        }
    }
    return pages;
}

fn z_b_is_filename(value: &str) -> bool {
    return value.contains('.') || value.contains('/');
}

fn z_c_parse_int_pair(value: &str) -> (f32, f32) {
    let mut values = value.split(',');
    return (
        z_d_parse_integer_prefix(values.next().unwrap_or("0")) as f32,
        z_d_parse_integer_prefix(values.next().unwrap_or("0")) as f32,
    );
}

fn z_d_parse_integer_prefix(value: &str) -> i32 {
    let value = value.trim_start();
    let bytes = value.as_bytes();
    let mut end = 0;
    if bytes
        .first()
        .is_some_and(|value| *value == b'-' || *value == b'+')
    {
        end = 1;
    }
    let start = end;
    while bytes.get(end).is_some_and(u8::is_ascii_digit) {
        end += 1;
    }
    if end == start {
        return 0;
    }
    return value[..end].parse().unwrap_or(0);
}
