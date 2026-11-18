//! flight-compiler: rust-only

// Animation time and keyframe samples are f64; blend weights, blend alpha, easing and normalized
// progress stay bounded f32 and widen losslessly before they touch a sample.

use flight_animation::contract::*;

fn linear_track(times: Vec<f64>, values: Vec<f64>) -> AnimationTrack {
    let mut track = create_animation_track();
    track.times = times;
    track.values = values;
    return track;
}

#[test]
fn samples_a_sub_millimetre_keyframe_delta_at_one_billion() {
    let track = linear_track(vec![0.0, 1.0], vec![1e9, 1e9 + 1e-3]);
    let mut out = [0.0_f64; 1];
    sample_animation_track(&mut out, &track, 0.25);
    assert!(
        (out[0] - (1e9 + 2.5e-4)).abs() < 2.5e-7,
        "sample {}",
        out[0]
    );
}

#[test]
fn keeps_keyframe_time_resolution_on_a_long_timeline() {
    let track = linear_track(vec![0.0, 1e6], vec![0.0, 1e6]);
    let mut out = [0.0_f64; 1];
    sample_animation_track(&mut out, &track, 999_999.5 + 1.0 / 60.0);
    assert!(
        (out[0] - (999_999.5 + 1.0 / 60.0)).abs() < 1e-6,
        "sample {}",
        out[0]
    );
}

#[test]
fn accumulates_player_time_in_f64() {
    let clip = create_animation_clip(Vec::new(), Some(1e6), &[]);
    let mut player = create_animation_player(clip);
    player.playing = true;
    seek_animation_player(&mut player, 999_000.0);
    for _ in 0..60 {
        advance_animation_player(&mut player, 1.0 / 60.0);
    }
    assert!(
        (player.time - 999_001.0).abs() < 1e-7,
        "time {}",
        player.time
    );
    let normalized: f32 = get_animation_player_normalized_time(&player);
    assert!((normalized - 0.999_001_f32).abs() < 1e-6);
}

#[test]
fn widens_bounded_blend_alpha_without_narrowing_samples() {
    let mut out = [0.0_f64; 1];
    blend_animation_samples(&mut out, &[1e9], &[1e9 + 4.0], 0.25_f32, false);
    assert_eq!(out[0], 1e9 + 1.0);

    let mut accumulator = create_animation_sample_accumulator(1, false);
    accumulate_animation_sample(&mut accumulator, &[1e9 + 1e-3], 0.5_f32);
    accumulate_animation_sample(&mut accumulator, &[1e9 + 3e-3], 0.5_f32);
    let mut blended = [0.0_f64; 1];
    assert!(finish_animation_sample(&mut blended, &accumulator));
    assert!(
        (blended[0] - (1e9 + 2e-3)).abs() < 2.5e-7,
        "blended {}",
        blended[0]
    );
}
