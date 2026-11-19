//! flight-compiler: target-native

// Tween time and animated values are f64 end to end; only the normalized progress and eased factor
// cross into bounded f32. At 1e9 the single-precision spacing is 64, so these deltas exist only
// because the values never narrow.

use std::sync::RwLock;

use flight_entity::Ref;
use flight_tween::contract::*;

fn linear_ease(t: f32) -> f32 {
    t
}

struct Obj {
    x: f64,
}

fn linear_manager() -> TweenManager {
    return create_tween_manager(Some(&TweenManagerOptions {
        default_ease: Some(linear_ease),
    }));
}

#[test]
fn interpolates_a_sub_millimetre_change_at_one_billion() {
    assert_ne!(START as f32 as f64, START);
    let manager = linear_manager();
    let target = Ref::new(RwLock::new(Obj { x: START }));
    create_tween(
        &manager,
        &target,
        1.0,
        &[TweenProp {
            get: TweenPropertyAccessor::F64(|t: &mut Obj| &mut t.x),
            key: "x",
            to: START + 1e-3,
        }],
        None,
    );
    update_tweens(&manager, 0.5);
    let x = target.read().unwrap().x;
    assert!((x - (START + 5e-4)).abs() < 2.5e-7, "x {x}");
    update_tweens(&manager, 0.5);
    assert_eq!(target.read().unwrap().x, START + 1e-3);
}

#[test]
fn accumulates_frame_time_in_f64_across_a_long_duration() {
    let manager = linear_manager();
    let target = Ref::new(RwLock::new(Obj { x: 0.0 }));
    let tween = create_tween(
        &manager,
        &target,
        1e6,
        &[TweenProp {
            get: TweenPropertyAccessor::F64(|t: &mut Obj| &mut t.x),
            key: "x",
            to: 1e6,
        }],
        None,
    );
    seek_tween(&tween, 999_999.0);
    update_tweens(&manager, 1.0 / 60.0);
    let elapsed = get_tween_elapsed(&tween);
    assert!(
        (elapsed - (999_999.0 + 1.0 / 60.0)).abs() < 1e-9,
        "elapsed {elapsed}"
    );
    // Normalized progress is the bounded f32 easing input by design, so an interpolated value is
    // quantized to |change| * 2^-24 near completion; elapsed time itself stays exact in f64.
    let x = target.read().unwrap().x;
    assert!((x - elapsed).abs() <= 1e6 * 2.0_f64.powi(-24), "x {x}");
}

#[test]
fn keeps_progress_and_easing_bounded_f32() {
    let manager = linear_manager();
    let target = Ref::new(RwLock::new(Obj { x: 0.0 }));
    let tween = create_tween(
        &manager,
        &target,
        4.0,
        &[TweenProp {
            get: TweenPropertyAccessor::F64(|t: &mut Obj| &mut t.x),
            key: "x",
            to: 8.0,
        }],
        None,
    );
    update_tweens(&manager, 1.0);
    let progress: f32 = get_tween_progress(&tween);
    assert_eq!(progress, 0.25);
    let ease: EasingFunction = linear_ease;
    assert_eq!(ease(0.5_f32), 0.5_f32);
    set_tween_progress(&tween, 0.5_f32);
    assert_eq!(target.read().unwrap().x, 4.0);
}

// A start value f32 cannot hold: its nearest single-precision neighbor is 1e9, half a unit away, so
// narrowing it anywhere shifts every result in this file by 0.5, far past the asserted deltas.
const START: f64 = 1e9 + 0.5;
