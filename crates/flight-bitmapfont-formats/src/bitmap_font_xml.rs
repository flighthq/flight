use flight_bitmapfont::{BitmapFont, BitmapFontEncoding, BitmapFontGuardStateRef};
use flight_entity::Ref;
use flight_importdiagnostics::ImportDiagnostic;
use flight_xml::{
    XmlElement, get_xml_element_attribute, get_xml_element_attribute_number,
    get_xml_element_child_by_name, get_xml_element_children_by_name, parse_xml_document,
};

use crate::bitmap_font_record::{
    build_bitmap_font_from_record, report_dropped_bitmap_font_records,
};
use crate::types::*;

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the bitmap-font module guard slot
pub fn parse_bitmap_font_xml(
    guard_state: &BitmapFontGuardStateRef,
    text: &str,
    options: Option<&BitmapFontParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Ref<BitmapFont>> {
    let record = parse_bitmap_font_xml_record(text, diagnostics)?;
    return build_bitmap_font_from_record(guard_state, &record, options);
}

fn parse_bitmap_font_xml_record(
    text: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<BitmapFontRecord> {
    let root = parse_xml_document(text)?;
    if root.name != "font" {
        return None;
    }
    let common = get_xml_element_child_by_name(&root, "common")?;
    let common = common.read().unwrap();
    let line_height = get_xml_element_attribute_number(&common, "lineHeight")? as f32;
    let base = get_xml_element_attribute_number(&common, "base")? as f32;
    drop(common);
    let mut dropped_pages = 0;
    let mut dropped_chars = 0;
    let mut dropped_kernings = 0;
    let mut pages = Vec::new();
    if let Some(parent) = get_xml_element_child_by_name(&root, "pages") {
        for page in get_xml_element_children_by_name(&parent.read().unwrap(), "page") {
            let page = page.read().unwrap();
            if let Some(id) = get_xml_element_attribute_number(&page, "id") {
                pages.push(BitmapFontPageRecord {
                    file: get_xml_element_attribute(&page, "file")
                        .unwrap_or_default()
                        .to_string(),
                    id: id as i32,
                });
            } else {
                dropped_pages += 1;
            }
        }
    }
    let mut chars = Vec::new();
    if let Some(parent) = get_xml_element_child_by_name(&root, "chars") {
        for character in get_xml_element_children_by_name(&parent.read().unwrap(), "char") {
            match read_xml_char(&character.read().unwrap()) {
                Some(character) => chars.push(character),
                None => dropped_chars += 1,
            }
        }
    }
    if chars.is_empty() {
        return None;
    }
    let mut kernings = Vec::new();
    if let Some(parent) = get_xml_element_child_by_name(&root, "kernings") {
        for pair in get_xml_element_children_by_name(&parent.read().unwrap(), "kerning") {
            match read_xml_kerning(&pair.read().unwrap()) {
                Some(pair) => kernings.push(pair),
                None => dropped_kernings += 1,
            }
        }
    }
    report_dropped_bitmap_font_records(
        diagnostics,
        "parseBitmapFontXmlRecord",
        dropped_pages,
        dropped_chars,
        dropped_kernings,
    );
    return Some(BitmapFontRecord {
        base,
        chars,
        encoding: BitmapFontEncoding::Raster,
        kernings,
        line_height,
        pages,
    });
}

fn read_xml_char(element: &XmlElement) -> Option<BitmapFontCharRecord> {
    return Some(BitmapFontCharRecord {
        height: get_xml_element_attribute_number(element, "height")? as u32,
        id: get_xml_element_attribute_number(element, "id")? as u32,
        page: get_xml_element_attribute_number(element, "page").unwrap_or(0.0) as i32,
        width: get_xml_element_attribute_number(element, "width")? as u32,
        x: get_xml_element_attribute_number(element, "x")? as u32,
        xadvance: get_xml_element_attribute_number(element, "xadvance")? as f32,
        xoffset: get_xml_element_attribute_number(element, "xoffset")? as i32,
        y: get_xml_element_attribute_number(element, "y")? as u32,
        yoffset: get_xml_element_attribute_number(element, "yoffset")? as i32,
    });
}

fn read_xml_kerning(element: &XmlElement) -> Option<BitmapFontKerningRecord> {
    return Some(BitmapFontKerningRecord {
        amount: get_xml_element_attribute_number(element, "amount")? as f32,
        first: get_xml_element_attribute_number(element, "first")? as u32,
        second: get_xml_element_attribute_number(element, "second")? as u32,
    });
}
