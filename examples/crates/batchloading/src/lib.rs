//! Host-neutral Rust approximation of the `batchloading` example.
//!
//! The TypeScript example is a DOM batch-loading UI: a title, a status line, a
//! rounded progress bar, a row of control buttons, three asset item rows (each
//! with a colored status dot), and a strip of loaded image thumbnails. None of
//! that is a scene-graph render — it is HTML/CSS driven by the resource loader.
//!
//! `ExamplePrimitive` fills every primitive with a single scene color, so this
//! port reproduces the UI's structural silhouette rather than its palette: the
//! dark navy backdrop, and the slate panels (progress track, buttons, item
//! rows, thumbnail frames) laid out at the same proportions as the HTML.

use example_common::{ExamplePrimitive, ExampleScene};

const BACKGROUND: u32 = 0x1a_1a_2e_ff;
const PANEL: u32 = 0x2d_37_48_ff;

const MARGIN: f32 = 32.0;
const CONTENT_WIDTH: f32 = 480.0;

pub fn create_scene() -> ExampleScene {
    let mut primitives = Vec::new();

    // Title placeholder (Text is not rasterized by the example model).
    primitives.push(ExamplePrimitive::Text {
        x: MARGIN,
        y: 44.0,
        value: "Batch Loading",
        size: 24.0,
    });

    // Progress bar track.
    primitives.push(ExamplePrimitive::RoundRectangle {
        x: MARGIN,
        y: 96.0,
        width: CONTENT_WIDTH,
        height: 12.0,
        radius: 6.0,
    });

    // Control buttons: Start, Pause, Resume, Cancel, Reset.
    let button_widths = [56.0_f32, 62.0, 70.0, 64.0, 58.0];
    let mut button_x = MARGIN;
    for width in button_widths {
        primitives.push(ExamplePrimitive::RoundRectangle {
            x: button_x,
            y: 128.0,
            width,
            height: 30.0,
            radius: 5.0,
        });
        button_x += width + 10.0;
    }

    // Asset item rows, each with a status dot.
    for index in 0..3 {
        let row_y = 178.0 + index as f32 * 48.0;
        primitives.push(ExamplePrimitive::RoundRectangle {
            x: MARGIN,
            y: row_y,
            width: CONTENT_WIDTH,
            height: 38.0,
            radius: 6.0,
        });
        primitives.push(ExamplePrimitive::Circle {
            x: MARGIN + 18.0,
            y: row_y + 19.0,
            radius: 5.0,
        });
    }

    // Loaded-image thumbnail frames.
    for index in 0..3 {
        primitives.push(ExamplePrimitive::RoundRectangle {
            x: MARGIN + index as f32 * 74.0,
            y: 326.0,
            width: 58.0,
            height: 58.0,
            radius: 4.0,
        });
    }

    ExampleScene::new("batchloading", "Batch loading")
        .with_background(BACKGROUND)
        .with_fill(PANEL)
        .with_primitives(primitives)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "batchloading");
    }
}
