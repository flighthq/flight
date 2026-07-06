//! Host-neutral Rust implementation of the `tweenexample` example.
//!
//! The TypeScript example scatters 80 circles of random radius, position, color,
//! and alpha across a 550x400 stage and tweens each toward a fresh random target
//! forever. The `ExamplePrimitive` model has a single scene-wide fill and no
//! per-shape alpha or motion, so this port reproduces the structural steady state
//! the animation lives in: a dense field of circles of varying radius spread over
//! the same stage on the same background. The layout uses a small deterministic
//! PRNG so the captured frame is stable rather than random.

use example_common::{ExamplePrimitive, ExampleScene};

pub const ID: &str = "tweenexample";
pub const TITLE: &str = "Tween example";
pub const WIDTH: u32 = 550;
pub const HEIGHT: u32 = 400;
pub const BACKGROUND: u32 = 0xee_dd_cc_ff;
pub const FILL: u32 = 0x33_99_cc_ff;

const CIRCLE_COUNT: u32 = 80;
const MIN_RADIUS: f32 = 25.0;
const MAX_RADIUS: f32 = 60.0;

pub fn create_scene() -> ExampleScene {
    ExampleScene::new(ID, TITLE)
        .with_size(WIDTH, HEIGHT)
        .with_background(BACKGROUND)
        .with_fill(FILL)
        .with_primitives(circle_field())
}

fn circle_field() -> Vec<ExamplePrimitive> {
    let mut rng = Rng::new(0x1234_5678_9abc_def0);
    (0..CIRCLE_COUNT)
        .map(|_| ExamplePrimitive::Circle {
            x: rng.next_range(0.0, WIDTH as f32),
            y: rng.next_range(0.0, HEIGHT as f32),
            radius: rng.next_range(MIN_RADIUS, MAX_RADIUS),
        })
        .collect()
}

/// Deterministic SplitMix64 so the generated field is reproducible across runs
/// and machines — the captured frame must be stable, unlike the TS random field.
struct Rng {
    state: u64,
}

impl Rng {
    fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next_unit(&mut self) -> f32 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^= z >> 31;
        (z >> 40) as f32 / (1u32 << 24) as f32
    }

    fn next_range(&mut self, min: f32, max: f32) -> f32 {
        min + self.next_unit() * (max - min)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "tweenexample");
    }

    #[test]
    fn fills_the_field() {
        let scene = create_scene();
        assert_eq!(scene.primitives.len(), CIRCLE_COUNT as usize);
    }
}
