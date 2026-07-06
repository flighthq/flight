//! Host-neutral Rust implementation of the `tweenexample` example.
//!
//! The TypeScript example scatters 80 circles of random radius, position, color,
//! and alpha across a 550x400 stage and tweens each toward a fresh random target
//! forever.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_displayobject::{
    DisplayObjectArena, add_display_object_child_at, create_display_object, get_display_object_x,
    set_display_object_alpha, set_display_object_x, set_display_object_y,
};
use flighthq_easing::ease_out_quad;
use flighthq_shape::{
    append_shape_begin_fill, append_shape_circle, append_shape_end_fill, create_shape,
};
use flighthq_signals::{SignalConnectOptions, connect_signal};
use flighthq_tween::{
    TweenManager, create_tween, create_tween_manager, create_tween_timer, update_tweens,
};
use flighthq_types::TweenOptions;
use std::sync::Arc;

pub const ID: &str = "tweenexample";
pub const TITLE: &str = "Tween example";
pub const WIDTH: u32 = 550;
pub const HEIGHT: u32 = 400;
pub const BACKGROUND: u32 = 0xee_dd_cc_ff;
pub const FILL: u32 = 0x33_99_cc_ff;

const CIRCLE_COUNT: u32 = 80;
const MIN_RADIUS: f32 = 25.0;
const MAX_RADIUS: f32 = 60.0;
const MIN_DURATION: f32 = 1.5;
const MAX_DURATION: f32 = 6.0;
const MAX_START_DELAY: f32 = 10.0;

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene();
    ExampleScene::new(ID, TITLE)
        .with_size(WIDTH, HEIGHT)
        .with_background(BACKGROUND)
        .with_fill(FILL)
        .with_primitives(circle_field())
}

pub struct TweenExampleApiScene {
    pub arena: DisplayObjectArena,
    pub manager: TweenManager,
    pub root: flighthq_node::NodeId,
    pub circles: Vec<flighthq_node::NodeId>,
}

pub fn create_api_scene() -> TweenExampleApiScene {
    let mut manager = create_tween_manager(None);
    let mut arena = DisplayObjectArena::default();
    let root = create_display_object(&mut arena);
    let mut rng = Rng::new(0x1234_5678_9abc_def0);
    let mut circles = Vec::with_capacity(CIRCLE_COUNT as usize);

    for index in 0..CIRCLE_COUNT {
        let radius = rng.next_range(MIN_RADIUS, MAX_RADIUS);
        let circle = create_shape(&mut arena);
        append_shape_begin_fill(
            &mut arena,
            circle,
            (rng.next_unit() * 0xffffff as f32) as u32,
            1.0,
        );
        append_shape_circle(&mut arena, circle, 0.0, 0.0, radius);
        append_shape_end_fill(&mut arena, circle);
        set_display_object_alpha(&mut arena, circle, 0.2 + rng.next_unit() * 0.6);
        set_display_object_x(&mut arena, circle, rng.next_range(0.0, WIDTH as f32));
        set_display_object_y(&mut arena, circle, rng.next_range(0.0, HEIGHT as f32));
        add_display_object_child_at(&mut arena, root, circle, 0);

        let delay = rng.next_range(0.0, MAX_START_DELAY);
        let timer_index = create_tween_timer(&mut manager, delay, None);
        let timer = &manager.tweens[&0][timer_index];
        let _timer_guard = connect_signal(
            &timer.on_complete,
            Arc::new(|_: &()| {}),
            SignalConnectOptions::default(),
        );

        let duration = rng.next_range(MIN_DURATION, MAX_DURATION);
        let target_id = index as u64 + 1;
        let tween_index = create_tween(
            &mut manager,
            target_id,
            duration,
            vec![
                ("x".to_string(), rng.next_range(0.0, WIDTH as f32)),
                ("y".to_string(), rng.next_range(0.0, HEIGHT as f32)),
            ],
            Some(TweenOptions {
                ease: Some(Arc::new(ease_out_quad)),
                overwrite: true,
                ..Default::default()
            }),
        );
        let tween = &manager.tweens[&target_id][tween_index];
        let _tween_guard = connect_signal(
            &tween.on_update,
            Arc::new(|_: &()| {}),
            SignalConnectOptions::default(),
        );
        circles.push(circle);
    }

    let applied = update_tweens(&mut manager, 1.0 / 60.0, &mut |target, keys| {
        keys.iter()
            .map(|key| {
                let value = if target > 0 {
                    let circle = circles[(target - 1) as usize];
                    match key.as_str() {
                        "x" => get_display_object_x(&arena, circle),
                        "y" => 0.0,
                        _ => 0.0,
                    }
                } else {
                    0.0
                };
                (key.clone(), value)
            })
            .collect()
    });
    for (target, key, value) in applied {
        if target > 0 {
            let circle = circles[(target - 1) as usize];
            match key.as_str() {
                "x" => set_display_object_x(&mut arena, circle, value),
                "y" => set_display_object_y(&mut arena, circle, value),
                _ => {}
            }
        }
    }

    TweenExampleApiScene {
        arena,
        manager,
        root,
        circles,
    }
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
    use flighthq_displayobject::get_display_object_child_count;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "tweenexample");
    }

    #[test]
    fn fills_the_field() {
        let scene = create_scene();
        assert_eq!(scene.primitives.len(), CIRCLE_COUNT as usize);
    }

    #[test]
    fn creates_matching_api_scene() {
        let scene = create_api_scene();
        assert_eq!(scene.circles.len(), CIRCLE_COUNT as usize);
        assert_eq!(
            get_display_object_child_count(&scene.arena, scene.root),
            CIRCLE_COUNT as usize
        );
        assert!(scene.manager.tweens.contains_key(&0));
    }
}
