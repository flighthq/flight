use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_node::Node;
use flight_scene2d::Node2DRef;
use flight_text::{RichText, create_rich_text};
use flight_textformat::create_text_format_range;
use flight_textformat::{FontVariation, TextFormat, TextFormatAlign};

use crate::rive_core_types::is_rive_core_type_derived_from;
use crate::rive_import_registry::{
    import_rive_core_object_as_data, register_rive_core_object_handler,
};
use crate::types::*;

pub fn create_rive_rich_text(
    artboard: &RiveArtboardGraph,
    index: usize,
    font_names: &[String],
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Ref<RichText> {
    let source = &artboard.objects[index];
    let runs = (index + 1..artboard.objects.len())
        .filter(|child| {
            artboard.parent_indices.get(*child).copied() == Some(index as i32)
                && artboard.objects[*child].type_key == RIVE_TEXT_VALUE_RUN as u64
        })
        .collect::<Vec<_>>();
    let align = read_rive_number(source, RIVE_TEXT_ALIGN, RIVE_ALIGN_LEFT);
    if ![RIVE_ALIGN_LEFT, RIVE_ALIGN_RIGHT, RIVE_ALIGN_CENTER].contains(&align) {
        report_import_diagnostic(
            diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Recover,
            "rive.text-align-substituted",
            "createRiveRichText",
            Some(HashMap::from([
                (
                    "alignValue".to_string(),
                    ImportDiagnosticDetailValue::Number(align),
                ),
                (
                    "substitutedAs".to_string(),
                    ImportDiagnosticDetailValue::String("left".to_string()),
                ),
            ])),
        );
    }
    let mut format_ranges = Vec::new();
    let mut unresolved_styles = HashSet::new();
    let mut text = String::new();
    let mut text_length = 0;
    for run in &runs {
        let value = read_rive_text(&artboard.objects[*run], RIVE_RUN_TEXT, "");
        let style = read_rive_number(&artboard.objects[*run], RIVE_RUN_STYLE_ID, -1.0) as i32;
        let end = text_length + value.encode_utf16().count();
        format_ranges.push(create_text_format_range(
            create_rive_text_format(
                artboard,
                style,
                align,
                font_names,
                diagnostics.as_deref_mut(),
                &mut unresolved_styles,
            ),
            text_length,
            end,
        ));
        text_length = end;
        text.push_str(&value);
    }
    let base_style = runs.first().map_or(-1, |run| {
        read_rive_number(&artboard.objects[*run], RIVE_RUN_STYLE_ID, -1.0) as i32
    });
    let format = create_rive_text_format(
        artboard,
        base_style,
        align,
        font_names,
        diagnostics.as_deref_mut(),
        &mut unresolved_styles,
    );
    let color = format
        .read()
        .unwrap()
        .color
        .unwrap_or(RIVE_DEFAULT_TEXT_COLOR);
    let label = create_rich_text(None);
    {
        let mut guard = label.write().unwrap();
        guard.data.default_text_format = format.clone();
        guard.data.height = read_rive_number(source, RIVE_TEXT_HEIGHT, 0.0);
        guard.data.text = text;
        guard.data.text_color = color;
        guard.data.text_format = format;
        guard.data.text_format_ranges = format_ranges;
        guard.data.width = read_rive_number(source, RIVE_TEXT_WIDTH, 0.0);
    }
    return label;
}

fn create_rive_text_format(
    artboard: &RiveArtboardGraph,
    style_index: i32,
    align: f32,
    font_names: &[String],
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    unresolved_styles: &mut HashSet<i32>,
) -> Ref<TextFormat> {
    let style = usize::try_from(style_index)
        .ok()
        .and_then(|index| artboard.objects.get(index));
    let mut format = TextFormat {
        align: Some(match align {
            RIVE_ALIGN_RIGHT => TextFormatAlign::Right,
            RIVE_ALIGN_CENTER => TextFormatAlign::Center,
            _ => TextFormatAlign::Left,
        }),
        color: Some(read_rive_style_color(artboard, style_index)),
        ..TextFormat::default()
    };
    let Some(style) = style else {
        if style_index >= 0 && unresolved_styles.insert(style_index) {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "rive.text-unresolved-style",
                "createRiveTextFormat",
                Some(HashMap::from([(
                    "styleIndex".to_string(),
                    ImportDiagnosticDetailValue::Number(style_index as f32),
                )])),
            );
        }
        return Arc::new(RwLock::new(format));
    };
    format.leading = Some(read_rive_number(style, RIVE_STYLE_LINE_HEIGHT, -1.0));
    format.letter_spacing = Some(read_rive_number(style, RIVE_STYLE_LETTER_SPACING, 0.0));
    format.size = Some(read_rive_number(
        style,
        RIVE_STYLE_FONT_SIZE,
        RIVE_DEFAULT_FONT_SIZE,
    ));
    let font_asset = read_rive_number(style, RIVE_STYLE_FONT_ASSET_ID, RIVE_MISSING_ASSET_ID);
    if let Some(name) = usize_from_rive_number(font_asset)
        .and_then(|index| font_names.get(index))
        .filter(|name| !name.is_empty())
    {
        format.font = Some(name.clone());
    }
    let variations = read_rive_style_axes(artboard, style_index);
    if !variations.is_empty() {
        format.variations = Some(Arc::new(variations));
    }
    return Arc::new(RwLock::new(format));
}

pub fn import_rive_text_component(
    context: &mut RiveArtboardImportContext<'_>,
    index: usize,
) -> Option<Node2DRef> {
    let label = create_rive_rich_text(
        context.artboard,
        index,
        context.font_names,
        context.diagnostics.as_deref_mut(),
    );
    label.write().unwrap().node_fields_mut().name =
        Some(read_rive_text_name(context.artboard.objects.get(index)?));
    let node: Node2DRef = label;
    return Some(node);
}

fn is_rive_descendant_of(artboard: &RiveArtboardGraph, index: usize, ancestor: usize) -> bool {
    let mut parent = artboard.parent_indices.get(index).copied().unwrap_or(-1);
    while let Ok(parent_index) = usize::try_from(parent) {
        if parent_index == ancestor {
            return true;
        }
        parent = artboard
            .parent_indices
            .get(parent_index)
            .copied()
            .unwrap_or(-1);
    }
    return false;
}

fn read_rive_number(source: &RiveCoreObject, key: u64, fallback: f32) -> f32 {
    return source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
        .map_or(fallback, |property| match property.value {
            RiveValue::Uint(value) => value as f32,
            RiveValue::Double(value) => value,
            RiveValue::Color(value) => value as f32,
            _ => fallback,
        });
}

fn read_rive_style_axes(artboard: &RiveArtboardGraph, style_index: i32) -> Vec<FontVariation> {
    let Ok(style_index) = usize::try_from(style_index) else {
        return Vec::new();
    };
    return (style_index + 1..artboard.objects.len())
        .filter(|index| {
            artboard.objects[*index].type_key == RIVE_TEXT_STYLE_AXIS as u64
                && artboard.parent_indices.get(*index).copied() == Some(style_index as i32)
        })
        .map(|index| FontVariation {
            axis: to_rive_open_type_tag(read_rive_u32(&artboard.objects[index], RIVE_AXIS_TAG, 0)),
            value: read_rive_number(&artboard.objects[index], RIVE_AXIS_VALUE, 0.0),
        })
        .collect();
}

fn read_rive_style_color(artboard: &RiveArtboardGraph, style_index: i32) -> u32 {
    let Ok(style_index) = usize::try_from(style_index) else {
        return RIVE_DEFAULT_TEXT_COLOR;
    };
    for index in style_index + 1..artboard.objects.len() {
        let object = &artboard.objects[index];
        if i32::try_from(object.type_key)
            .ok()
            .is_none_or(|key| !is_rive_core_type_derived_from(key, RIVE_SOLID_COLOR))
            || !is_rive_descendant_of(artboard, index, style_index)
        {
            continue;
        }
        let packed = read_rive_u32(object, RIVE_SOLID_COLOR_VALUE, 0);
        return ((packed & 0x00ff0000) << 8)
            | ((packed & 0x0000ff00) << 8)
            | ((packed & 0x000000ff) << 8)
            | ((packed >> 24) & 0xff);
    }
    return RIVE_DEFAULT_TEXT_COLOR;
}

fn read_rive_text(source: &RiveCoreObject, key: u64, fallback: &str) -> String {
    return source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
        .and_then(|property| match &property.value {
            RiveValue::String(value) => Some(value.clone()),
            _ => None,
        })
        .unwrap_or_else(|| fallback.to_string());
}

fn read_rive_text_name(source: &RiveCoreObject) -> String {
    return read_rive_text(source, RIVE_NAME, "");
}

fn read_rive_u32(source: &RiveCoreObject, key: u64, fallback: u32) -> u32 {
    return source
        .properties
        .iter()
        .find(|candidate| candidate.key == key)
        .map_or(fallback, |property| match property.value {
            RiveValue::Uint(value) => value as u32,
            RiveValue::Double(value) => value as u32,
            RiveValue::Color(value) => value,
            _ => fallback,
        });
}

pub fn register_rive_text_handlers(registry: &mut RiveImportRegistry) {
    register_rive_core_object_handler(
        registry,
        RIVE_TEXT,
        Arc::new(RiveCoreObjectHandler {
            import_component: Some(Arc::new(import_rive_text_component)),
            ..RiveCoreObjectHandler::default()
        }),
    );
    let part = Arc::new(RiveCoreObjectHandler {
        import_component: Some(Arc::new(|_, _| import_rive_core_object_as_data())),
        ..RiveCoreObjectHandler::default()
    });
    for type_key in [RIVE_TEXT_VALUE_RUN, RIVE_TEXT_STYLE, RIVE_TEXT_STYLE_AXIS] {
        register_rive_core_object_handler(registry, type_key, part.clone());
    }
}

fn to_rive_open_type_tag(packed: u32) -> String {
    return [
        ((packed >> 24) & 0xff) as u8,
        ((packed >> 16) & 0xff) as u8,
        ((packed >> 8) & 0xff) as u8,
        (packed & 0xff) as u8,
    ]
    .into_iter()
    .map(char::from)
    .collect();
}

fn usize_from_rive_number(value: f32) -> Option<usize> {
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 {
        return None;
    }
    return Some(value as usize);
}

const RIVE_NAME: u64 = 4;
const RIVE_TEXT: i32 = 134;
const RIVE_TEXT_VALUE_RUN: i32 = 135;
const RIVE_TEXT_STYLE: i32 = 573;
const RIVE_TEXT_STYLE_AXIS: i32 = 144;
const RIVE_SOLID_COLOR: i32 = 18;
const RIVE_RUN_TEXT: u64 = 268;
const RIVE_RUN_STYLE_ID: u64 = 272;
const RIVE_STYLE_FONT_SIZE: u64 = 274;
const RIVE_STYLE_FONT_ASSET_ID: u64 = 279;
const RIVE_TEXT_ALIGN: u64 = 281;
const RIVE_TEXT_WIDTH: u64 = 285;
const RIVE_TEXT_HEIGHT: u64 = 286;
const RIVE_AXIS_VALUE: u64 = 288;
const RIVE_AXIS_TAG: u64 = 289;
const RIVE_STYLE_LINE_HEIGHT: u64 = 370;
const RIVE_STYLE_LETTER_SPACING: u64 = 390;
const RIVE_SOLID_COLOR_VALUE: u64 = 37;
const RIVE_ALIGN_LEFT: f32 = 0.0;
const RIVE_ALIGN_RIGHT: f32 = 1.0;
const RIVE_ALIGN_CENTER: f32 = 2.0;
const RIVE_DEFAULT_FONT_SIZE: f32 = 12.0;
const RIVE_MISSING_ASSET_ID: f32 = -1.0;
const RIVE_DEFAULT_TEXT_COLOR: u32 = 0x000000ff;
