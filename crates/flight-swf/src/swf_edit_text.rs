use std::sync::{Arc, RwLock};

use flight_color::pack_color;
use flight_entity::Ref;
use flight_text::{RichText, create_rich_text};
use flight_text_markup::{create_text_markup_guard_state, parse_text_markup};
use flight_textformat::{TextFormat, TextFormatAlign};

use crate::SwfReader;

pub type SwfFontNameResolver = Arc<dyn Fn(u32) -> String + Send + Sync>;
pub type SwfEditTextFactory = Arc<dyn Fn(&SwfFontNameResolver) -> Ref<RichText> + Send + Sync>;

#[derive(Clone)]
struct SwfEditTextField {
    align: TextFormatAlign,
    border: bool,
    color: u32,
    font_height: f32,
    font_id: u32,
    has_color: bool,
    height: f32,
    html: bool,
    indent: f32,
    leading: f32,
    left_margin: f32,
    max_chars: i32,
    multiline: bool,
    read_only: bool,
    right_margin: f32,
    selectable: bool,
    text: String,
    width: f32,
    word_wrap: bool,
}

pub fn read_swf_edit_text_factory(
    reader: &mut SwfReader,
    width: f32,
    height: f32,
) -> Option<SwfEditTextFactory> {
    let flags = reader.read_uint8();
    let layout_flags = reader.read_uint8();
    if !reader.valid {
        return None;
    }
    let font_id = if flags & EDIT_TEXT_HAS_FONT != 0 {
        u32::from(reader.read_uint16())
    } else {
        0
    };
    if layout_flags & EDIT_TEXT_HAS_FONT_CLASS != 0 {
        reader.read_string();
    }
    let font_height = if flags & EDIT_TEXT_HAS_FONT != 0 {
        f32::from(reader.read_uint16())
    } else {
        0.0
    };

    let mut color = 0;
    let mut has_color = false;
    if flags & EDIT_TEXT_HAS_TEXT_COLOR != 0 {
        let red = reader.read_uint8();
        let green = reader.read_uint8();
        let blue = reader.read_uint8();
        let alpha = reader.read_uint8();
        color = pack_color(
            f32::from(red) / 0xff as f32,
            f32::from(green) / 0xff as f32,
            f32::from(blue) / 0xff as f32,
            f32::from(alpha) / 0xff as f32,
        );
        has_color = true;
    }
    let max_chars = if flags & EDIT_TEXT_HAS_MAX_LENGTH != 0 {
        i32::from(reader.read_uint16())
    } else {
        -1
    };

    let mut align = TextFormatAlign::Left;
    let mut left_margin = 0.0;
    let mut right_margin = 0.0;
    let mut indent = 0.0;
    let mut leading = 0.0;
    if layout_flags & EDIT_TEXT_HAS_LAYOUT != 0 {
        align = swf_edit_text_resolve_align(reader.read_uint8());
        left_margin = f32::from(reader.read_uint16()) / TWIPS_PER_PIXEL;
        right_margin = f32::from(reader.read_uint16()) / TWIPS_PER_PIXEL;
        indent = f32::from(reader.read_uint16()) / TWIPS_PER_PIXEL;
        leading = swf_edit_text_read_signed(reader) as f32 / TWIPS_PER_PIXEL;
    }

    reader.read_string();
    let text = if flags & EDIT_TEXT_HAS_TEXT != 0 {
        reader.read_string()
    } else {
        String::new()
    };
    if !reader.valid {
        return None;
    }
    let field = SwfEditTextField {
        align,
        border: layout_flags & EDIT_TEXT_BORDER != 0,
        color,
        font_height: font_height / TWIPS_PER_PIXEL,
        font_id,
        has_color,
        height,
        html: layout_flags & EDIT_TEXT_HTML != 0,
        indent,
        leading,
        left_margin,
        max_chars,
        multiline: flags & EDIT_TEXT_MULTILINE != 0,
        read_only: flags & EDIT_TEXT_READ_ONLY != 0,
        right_margin,
        selectable: layout_flags & EDIT_TEXT_NO_SELECT == 0,
        text,
        width,
        word_wrap: flags & EDIT_TEXT_WORD_WRAP != 0,
    };
    return Some(Arc::new(move |resolve_font_name| {
        let font_name = resolve_font_name(field.font_id);
        return swf_edit_text_create_node(&field, &font_name);
    }));
}

fn swf_edit_text_create_node(field: &SwfEditTextField, font_name: &str) -> Ref<RichText> {
    let mut format = TextFormat::default();
    format.align = Some(field.align);
    format.indent = Some(field.indent);
    format.leading = Some(field.leading);
    format.left_margin = Some(field.left_margin);
    format.right_margin = Some(field.right_margin);
    format.size = Some(field.font_height);
    if field.has_color {
        format.color = Some(field.color);
    }
    if !font_name.is_empty() {
        format.font = Some(font_name.to_string());
    }
    let format = Arc::new(RwLock::new(format));
    let content = field
        .html
        .then(|| parse_text_markup(&field.text, None, &create_text_markup_guard_state()));
    let node = create_rich_text(None);
    {
        let mut guard = node.write().unwrap();
        guard.data.border = field.border;
        guard.data.default_text_format = format.clone();
        guard.data.height = field.height;
        guard.data.max_chars = field.max_chars;
        guard.data.multiline = field.multiline;
        guard.data.selectable = field.selectable && !field.read_only;
        guard.data.text = content
            .as_ref()
            .map(|value| value.text.clone())
            .unwrap_or_else(|| field.text.clone());
        if let Some(content) = content {
            guard.data.text_format_ranges = content.format_ranges;
        }
        if field.has_color {
            guard.data.text_color = field.color;
        }
        guard.data.text_format = format;
        guard.data.width = field.width;
        guard.data.word_wrap = field.word_wrap;
    }
    return node;
}

fn swf_edit_text_read_signed(reader: &mut SwfReader) -> i32 {
    return i32::from(reader.read_uint16() as i16);
}

fn swf_edit_text_resolve_align(value: u8) -> TextFormatAlign {
    if value == EDIT_TEXT_ALIGN_RIGHT {
        return TextFormatAlign::Right;
    }
    if value == EDIT_TEXT_ALIGN_CENTER {
        return TextFormatAlign::Center;
    }
    return if value == EDIT_TEXT_ALIGN_JUSTIFY {
        TextFormatAlign::Justify
    } else {
        TextFormatAlign::Left
    };
}

const EDIT_TEXT_ALIGN_CENTER: u8 = 2;
const EDIT_TEXT_ALIGN_JUSTIFY: u8 = 3;
const EDIT_TEXT_ALIGN_RIGHT: u8 = 1;
const EDIT_TEXT_BORDER: u8 = 0x08;
const EDIT_TEXT_HAS_FONT: u8 = 0x01;
const EDIT_TEXT_HAS_FONT_CLASS: u8 = 0x80;
const EDIT_TEXT_HAS_LAYOUT: u8 = 0x20;
const EDIT_TEXT_HAS_MAX_LENGTH: u8 = 0x02;
const EDIT_TEXT_HAS_TEXT: u8 = 0x80;
const EDIT_TEXT_HAS_TEXT_COLOR: u8 = 0x04;
const EDIT_TEXT_HTML: u8 = 0x02;
const EDIT_TEXT_MULTILINE: u8 = 0x20;
const EDIT_TEXT_NO_SELECT: u8 = 0x10;
const EDIT_TEXT_READ_ONLY: u8 = 0x08;
const EDIT_TEXT_WORD_WRAP: u8 = 0x40;
const TWIPS_PER_PIXEL: f32 = 20.0;
