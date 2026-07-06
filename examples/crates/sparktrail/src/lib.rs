//! Host-neutral Rust implementation of the `sparktrail` example.
//!
//! The TypeScript original is an interactive, additive-glow particle emitter that
//! leaves a trail of warm embers following the cursor. The `ExamplePrimitive`
//! model has no particle system, additive blend, or per-spark lifetime/tint, so
//! this is a static structural stand-in: a dark stage with a warm-orange spark
//! trail sketched as a stream of scattered circles that thins and shrinks as it
//! trails away from a bright emitter cluster near the centre. It captures the
//! stage size, dark background, and trail layout of the original — not its
//! animation, blending, or colour ramp.

use example_common::{ExamplePrimitive, ExampleScene};

const WIDTH: u32 = 800;
const HEIGHT: u32 = 400;

// Dark stage the additive sparks glow against, matching the TS clear colour.
const BACKGROUND: u32 = 0x0a_0a_0a_ff;
// The vivid orange from the middle of the TS spark gradient. Sparks are a single
// warm fill here since the model cannot express the white-hot → ember-red ramp.
const FILL: u32 = 0xff_96_14_ff;

pub fn create_scene() -> ExampleScene {
    ExampleScene::new("sparktrail", "Spark trail")
        .with_size(WIDTH, HEIGHT)
        .with_background(BACKGROUND)
        .with_fill(FILL)
        .with_primitives(spark_primitives())
}

fn spark_primitives() -> Vec<ExamplePrimitive> {
    // The emitter sits near the centre; the trail curves back and up toward the
    // left, thinning and shrinking with distance like fading embers.
    let emitter_x = WIDTH as f32 * 0.5;
    let emitter_y = HEIGHT as f32 * 0.5;

    let mut primitives = Vec::new();

    // Bright, dense core cluster at the emitter head (golden-angle scatter).
    for index in 0..14 {
        let angle = index as f32 * 2.399_963;
        let spread = 2.0 + index as f32 * 1.4;
        primitives.push(ExamplePrimitive::Circle {
            x: emitter_x + angle.cos() * spread,
            y: emitter_y + angle.sin() * spread,
            radius: 9.0 - index as f32 * 0.4,
        });
    }

    // Trailing stream: sparks left behind along an upward-curving arc to the left,
    // each smaller and more scattered than the last, with gravity pulling the tail
    // back down.
    let count = 48;
    for index in 0..count {
        let t = index as f32 / (count as f32 - 1.0);
        let along = t * 360.0;
        let base_x = emitter_x - along;
        let base_y = emitter_y - (t * std::f32::consts::PI).sin() * 70.0 + t * t * 40.0;

        // Deterministic scatter off the path; jitter grows toward the tail.
        let jitter = 6.0 + t * 26.0;
        let seed = index as f32;
        let offset_x = (seed * 12.9898).sin() * jitter;
        let offset_y = (seed * 78.233).sin() * jitter;

        let radius = (7.5 * (1.0 - t) + 1.2).max(1.0);
        primitives.push(ExamplePrimitive::Circle {
            x: base_x + offset_x,
            y: base_y + offset_y,
            radius,
        });

        // Occasional secondary ember for a denser streak near the head.
        if index % 3 == 0 {
            primitives.push(ExamplePrimitive::Circle {
                x: base_x - offset_x * 0.6,
                y: base_y - offset_y * 0.6,
                radius: (radius * 0.6).max(1.0),
            });
        }
    }

    primitives
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "sparktrail");
    }
}
