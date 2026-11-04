//! flight-compiler: target-native

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
    let line_height_value = get_xml_element_attribute_number(&common, "lineHeight")?;
    let line_height = line_height_value as f32;
    let base_value = get_xml_element_attribute_number(&common, "base")?;
    let base = base_value as f32;
    drop(common);
    let mut dropped_pages = 0;
    let mut dropped_chars = 0;
    let mut dropped_kernings = 0;
    let mut pages = Vec::new();
    if let Some(parent) = get_xml_element_child_by_name(&root, "pages") {
        let found = get_xml_element_children_by_name(&parent.read().unwrap(), "page");
        for page in found {
            let page = page.read().unwrap();
            if let Some(id) = get_xml_element_attribute_number(&page, "id") {
                pages.push(BitmapFontPageRecord {
                    file: get_xml_element_attribute(&page, "file")
                        .unwrap_or("")
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
        let found = get_xml_element_children_by_name(&parent.read().unwrap(), "char");
        for character in found {
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
        let found = get_xml_element_children_by_name(&parent.read().unwrap(), "kerning");
        for pair in found {
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
    let height = get_xml_element_attribute_number(element, "height")?;
    let id = get_xml_element_attribute_number(element, "id")?;
    let width = get_xml_element_attribute_number(element, "width")?;
    let x = get_xml_element_attribute_number(element, "x")?;
    let xadvance = get_xml_element_attribute_number(element, "xadvance")?;
    let xoffset = get_xml_element_attribute_number(element, "xoffset")?;
    let y = get_xml_element_attribute_number(element, "y")?;
    let yoffset = get_xml_element_attribute_number(element, "yoffset")?;
    return Some(BitmapFontCharRecord {
        height: height as u32,
        id: id as u32,
        page: get_xml_element_attribute_number(element, "page").unwrap_or(0.0) as i32,
        width: width as u32,
        x: x as u32,
        xadvance: xadvance as f32,
        xoffset: xoffset as i32,
        y: y as u32,
        yoffset: yoffset as i32,
    });
}

fn read_xml_kerning(element: &XmlElement) -> Option<BitmapFontKerningRecord> {
    let amount = get_xml_element_attribute_number(element, "amount")?;
    let first = get_xml_element_attribute_number(element, "first")?;
    let second = get_xml_element_attribute_number(element, "second")?;
    return Some(BitmapFontKerningRecord {
        amount: amount as f32,
        first: first as u32,
        second: second as u32,
    });
}
