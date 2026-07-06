//! Host-neutral Rust port of the `textmetrics` example.
//!
//! The TypeScript original visualizes text-layout metrics: a bordered `RichText`
//! field, an offscreen-measured set of green/red guide lines (text width, height,
//! ascent, descent, leading), a word-wrapped lorem-ipsum block, and a printed
//! metrics readout. Reproducing it exactly needs real text layout/measurement and
//! multi-color fills — neither of which `ExamplePrimitive` can express (a scene
//! carries a single fill color and its `Text` variant does not rasterize). This
//! port keeps the original stage geometry and reconstructs the parts that depend
//! only on the field/buffer/gutter layout (the panel, the field border box, and
//! the axis guide lines), plus label markers where the metrics text would sit.

use example_common::{ExamplePrimitive, ExampleScene};

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

pub fn create_scene() -> ExampleScene {
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
}
