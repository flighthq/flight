//! Host-neutral Rust port of the `textmetrics` example.
//!
//! The TypeScript original visualizes text-layout metrics: a bordered `RichText`
//! field, measured green/red guide lines, a word-wrapped lorem-ipsum block, and
//! a printed metrics readout.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_application::create_application;
use flighthq_displayobject::{DisplayObjectArena, add_display_object_child, create_display_object};
use flighthq_shape::{append_shape_begin_fill, append_shape_rectangle, create_shape};
use flighthq_text::rich_text::{
    RichText, create_rich_text, set_rich_text_default_text_format, set_rich_text_height,
    set_rich_text_multiline, set_rich_text_selectable, set_rich_text_string, set_rich_text_width,
    set_rich_text_word_wrap,
};
use flighthq_textlayout::{
    compute_text_layout, create_text_format_range, create_text_layout_result,
};
use flighthq_types::{TextFormat, TextFormatAlign, TextLayoutParams, TextLayoutResult};

const BUFFER: f32 = 64.0;
const GUTTER: f32 = 2.0;
const FIELD_W: f32 = 354.0;
const FIELD_H: f32 = 354.0;
const TEXT_X: f32 = 300.0;
const TEXT_Y: f32 = 100.0;

// The visualization panel origin matches the original's `TEXT_X - BUFFER` / `TEXT_Y - BUFFER`.
const PANEL_X: f32 = TEXT_X - BUFFER;
const PANEL_Y: f32 = TEXT_Y - BUFFER;
const PANEL_W: f32 = FIELD_W + BUFFER * 2.0;
const PANEL_H: f32 = FIELD_H + BUFFER * 2.0;

const LINE: f32 = 2.0;
const TEXT: &str = "Wqx\nWqx";

pub struct TextMetricsApiScene {
    pub arena: DisplayObjectArena,
    pub root: flighthq_node::NodeId,
    pub text_field: RichText,
    pub lorem_text: RichText,
    pub result: TextLayoutResult,
}

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene();
    let mut primitives = Vec::new();

    // Visualization panel outline (the light-gray metrics bitmap in the original).
    push_outline(&mut primitives, PANEL_X, PANEL_Y, PANEL_W, PANEL_H);

    // Bordered text field.
    push_outline(&mut primitives, TEXT_X, TEXT_Y, FIELD_W, FIELD_H);

    // Guide lines that depend only on the layout box (not on measured glyph metrics):
    // the field-width axis near the top and the field-height axis on the left, with
    // their boundary markers. These mirror the geometry of the original's
    // green/red `text.width` and `text.height` guides.
    let g = GUTTER;

    // text.width axis: horizontal bar plus the two vertical field edges.
    push_rect(
        &mut primitives,
        PANEL_X + BUFFER,
        PANEL_Y + BUFFER / 2.0,
        FIELD_W,
        LINE,
    );
    push_rect(&mut primitives, PANEL_X + BUFFER, PANEL_Y, LINE, PANEL_H);
    push_rect(
        &mut primitives,
        PANEL_X + BUFFER + FIELD_W,
        PANEL_Y,
        LINE,
        PANEL_H,
    );

    // text.height axis: vertical bar plus the two horizontal field edges.
    push_rect(
        &mut primitives,
        PANEL_X + BUFFER / 4.0,
        PANEL_Y + BUFFER,
        LINE,
        FIELD_H,
    );
    push_rect(
        &mut primitives,
        PANEL_X + BUFFER / 4.0,
        PANEL_Y + BUFFER,
        PANEL_W - g * 2.0,
        LINE,
    );
    push_rect(
        &mut primitives,
        PANEL_X + BUFFER / 4.0,
        PANEL_Y + BUFFER + FIELD_H,
        PANEL_W - g * 2.0,
        LINE,
    );

    // Lorem-ipsum block outline (the white 200x200 word-wrap panel in the original).
    push_outline(&mut primitives, 0.0, 250.0, 200.0, 200.0);

    // Markers where the metrics readout and field content would be rendered.
    primitives.push(ExamplePrimitive::Text {
        x: 8.0,
        y: 20.0,
        value: "textmetrics",
        size: 16.0,
    });
    primitives.push(ExamplePrimitive::Text {
        x: TEXT_X + 8.0,
        y: TEXT_Y + 120.0,
        value: "Wqx",
        size: 120.0,
    });

    ExampleScene::new("textmetrics", "Text metrics")
        .with_size(720, 520)
        .with_background(0xa0_a0_a0_ff)
        .with_fill(0x20_20_20_ff)
        .with_primitives(primitives)
}

pub fn create_api_scene() -> TextMetricsApiScene {
    let _app = create_application();
    let mut arena = DisplayObjectArena::default();
    let root = create_display_object(&mut arena);
    let format = TextFormat {
        align: Some(TextFormatAlign::Center),
        font: Some("serif".to_string()),
        leading: Some(20.0),
        size: Some(120.0),
        ..Default::default()
    };

    let mut text_field = create_rich_text(None);
    set_rich_text_default_text_format(&mut text_field, format.clone());
    set_rich_text_height(&mut text_field, FIELD_H);
    set_rich_text_multiline(&mut text_field, true);
    set_rich_text_selectable(&mut text_field, false);
    set_rich_text_string(&mut text_field, TEXT.to_string());
    set_rich_text_width(&mut text_field, FIELD_W);
    set_rich_text_word_wrap(&mut text_field, true);

    let mut result = create_text_layout_result();
    compute_text_layout(
        &mut result,
        &TextLayoutParams {
            format_ranges: vec![create_text_format_range(format.clone(), 0, TEXT.len())],
            height: FIELD_H,
            multiline: true,
            text: TEXT.to_string(),
            width: FIELD_W,
            word_wrap: true,
            ..Default::default()
        },
        &|text, fmt| text.chars().count() as f32 * fmt.size.unwrap_or(16.0) * 0.5,
    );

    let viz_bg = create_shape(&mut arena);
    append_shape_begin_fill(&mut arena, viz_bg, 0xe0e0e0ff, 1.0);
    append_shape_rectangle(&mut arena, viz_bg, 0.0, 0.0, PANEL_W, PANEL_H);
    add_display_object_child(&mut arena, root, viz_bg);

    let white_bg = create_shape(&mut arena);
    append_shape_begin_fill(&mut arena, white_bg, 0xffffffff, 1.0);
    append_shape_rectangle(&mut arena, white_bg, 0.0, 0.0, 200.0, 200.0);
    add_display_object_child(&mut arena, root, white_bg);

    let mut lorem_text = create_rich_text(None);
    set_rich_text_height(&mut lorem_text, 200.0);
    set_rich_text_multiline(&mut lorem_text, true);
    set_rich_text_string(
        &mut lorem_text,
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit.".to_string(),
    );
    set_rich_text_width(&mut lorem_text, 200.0);
    set_rich_text_word_wrap(&mut lorem_text, true);

    TextMetricsApiScene {
        arena,
        root,
        text_field,
        lorem_text,
        result,
    }
}

fn push_rect(primitives: &mut Vec<ExamplePrimitive>, x: f32, y: f32, width: f32, height: f32) {
    primitives.push(ExamplePrimitive::Rectangle {
        x,
        y,
        width,
        height,
    });
}

fn push_outline(primitives: &mut Vec<ExamplePrimitive>, x: f32, y: f32, width: f32, height: f32) {
    push_rect(primitives, x, y, width, LINE);
    push_rect(primitives, x, y + height - LINE, width, LINE);
    push_rect(primitives, x, y, LINE, height);
    push_rect(primitives, x + width - LINE, y, LINE, height);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "textmetrics");
    }

    #[test]
    fn creates_matching_api_scene() {
        let scene = create_api_scene();
        assert_eq!(scene.text_field.data.text, TEXT);
        assert!(scene.result.num_lines >= 1);
    }
}
