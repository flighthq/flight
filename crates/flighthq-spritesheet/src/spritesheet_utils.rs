use flighthq_types::{Spritesheet, SpritesheetAnimation, SpritesheetFrame, SpritesheetPlayer};

use crate::spritesheet_animation::CreateSpritesheetAnimationOptions;
use crate::spritesheet_player::update_spritesheet_player;

/// Deep-clones a [`SpritesheetAnimation`].
pub fn clone_spritesheet_animation(animation: &SpritesheetAnimation) -> SpritesheetAnimation {
    animation.clone()
}

/// Deep-clones a [`SpritesheetFrame`].
pub fn clone_spritesheet_frame(frame: &SpritesheetFrame) -> SpritesheetFrame {
    frame.clone()
}

/// Returns the total duration of `animation` in milliseconds.
///
/// The duration is `frames.len() * frame_duration`. Returns `0.0` when the
/// animation has no frames.
pub fn compute_spritesheet_animation_duration(animation: &SpritesheetAnimation) -> f32 {
    animation.frames.len() as f32 * animation.frame_duration
}

/// Returns the number of frames in `animation`.
pub fn compute_spritesheet_frame_count(animation: &SpritesheetAnimation) -> usize {
    animation.frames.len()
}

/// Creates a [`SpritesheetAnimation`] from explicitly listed frame indices
/// within `spritesheet`.
///
/// Each index in `frame_indices` is validated against `spritesheet.frames`;
/// indices that are out of bounds are silently filtered out. Optional settings
/// (frame duration, looping, origin) are applied from `options`.
pub fn create_spritesheet_animation_from_atlas(
    spritesheet: &Spritesheet,
    frame_indices: &[u32],
    options: Option<&CreateSpritesheetAnimationOptions>,
) -> SpritesheetAnimation {
    let frame_count = spritesheet.frames.len() as u32;
    let valid_frames: Vec<u32> = frame_indices
        .iter()
        .copied()
        .filter(|&i| i < frame_count)
        .collect();

    let (frame_duration, loop_, origin_x, origin_y) = match options {
        Some(opts) => (
            opts.frame_duration.unwrap_or(0.0),
            opts.loop_.unwrap_or(false),
            opts.origin_x.unwrap_or(0.0),
            opts.origin_y.unwrap_or(0.0),
        ),
        None => (0.0, false, 0.0, 0.0),
    };

    SpritesheetAnimation {
        frames: valid_frames,
        frame_duration,
        loop_,
        origin_x,
        origin_y,
    }
}

/// Compatibility stub. In Rust, signals are always present on
/// [`SpritesheetPlayer`] (they are not optional), so this function is a no-op.
pub fn enable_spritesheet_signals(_player: &mut SpritesheetPlayer) {}

/// Returns the frame index within `animation.frames` for the given elapsed
/// `time` in milliseconds.
///
/// Handles looping via modular arithmetic. Returns `None` when the animation
/// has no frames or the total duration is zero.
pub fn get_spritesheet_animation_at_time(
    animation: &SpritesheetAnimation,
    time: f32,
) -> Option<u32> {
    let count = animation.frames.len();
    if count == 0 {
        return None;
    }
    let total = count as f32 * animation.frame_duration;
    if total <= 0.0 {
        return Some(0);
    }
    let time_in_loop = time % total;
    let index = (time_in_loop / animation.frame_duration).floor() as usize;
    Some(index.min(count - 1) as u32)
}

/// Returns the sprite frame ID at `index` within `animation.frames`.
///
/// Returns `None` when `index` is out of bounds.
pub fn get_spritesheet_animation_frame_at_index(
    animation: &SpritesheetAnimation,
    index: usize,
) -> Option<u32> {
    animation.frames.get(index).copied()
}

/// Returns the number of frames in `animation`.
pub fn get_spritesheet_animation_frame_count(animation: &SpritesheetAnimation) -> usize {
    animation.frames.len()
}

/// Resets `player` to its initial state.
///
/// Sets `elapsed` to `0.0`, `frame_index` to `0`, and clears the queue.
/// If the player has an active animation, `complete` is set to `false`;
/// otherwise it remains `true`.
pub fn reset_spritesheet_animation(player: &mut SpritesheetPlayer) {
    player.elapsed = 0.0;
    player.frame_index = 0;
    player.complete = player.animation.is_none();
    player.queue.clear();
}

/// Reverses the frame order of `animation` in place.
pub fn reverse_spritesheet_animation(animation: &mut SpritesheetAnimation) {
    animation.frames.reverse();
}

/// Playback speed stub. `SpritesheetPlayer` does not currently carry a speed
/// field, so this function is a no-op.
pub fn set_spritesheet_animation_speed(_player: &mut SpritesheetPlayer, _speed: f32) {}

/// Advances `player` by `delta_time` milliseconds.
///
/// This is a thin wrapper around [`update_spritesheet_player`].
pub fn update_spritesheet_animation(player: &mut SpritesheetPlayer, delta_time: f32) -> bool {
    update_spritesheet_player(player, delta_time)
}

/// Replaces the frame list of `animation` with `frame_ids`.
pub fn update_spritesheet_animation_from_frames(
    animation: &mut SpritesheetAnimation,
    frame_ids: &[u32],
) {
    animation.frames = frame_ids.to_vec();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spritesheet::CreateSpritesheetOptions;
    use crate::spritesheet::create_spritesheet;
    use crate::spritesheet_animation::create_spritesheet_animation;
    use crate::spritesheet_frame::CreateSpritesheetFrameOptions;
    use crate::spritesheet_frame::create_spritesheet_frame;
    use crate::spritesheet_player::CreateSpritesheetPlayerOptions;
    use crate::spritesheet_player::create_spritesheet_player;
    use crate::spritesheet_player::play_spritesheet_animation;

    fn make_animation(
        frame_indices: Vec<u32>,
        frame_duration: f32,
        loop_: bool,
    ) -> SpritesheetAnimation {
        create_spritesheet_animation(CreateSpritesheetAnimationOptions {
            frames: Some(frame_indices),
            frame_duration: Some(frame_duration),
            loop_: Some(loop_),
            ..Default::default()
        })
    }

    fn make_sheet(frame_count: u32) -> Spritesheet {
        let mut sheet = create_spritesheet(CreateSpritesheetOptions::default());
        for i in 0..frame_count {
            sheet
                .frames
                .push(create_spritesheet_frame(CreateSpritesheetFrameOptions {
                    id: Some(i),
                    ..Default::default()
                }));
        }
        sheet
    }

    #[test]
    fn clone_spritesheet_animation_deep_copies() {
        let original = make_animation(vec![0, 1, 2], 100.0, true);
        let mut cloned = clone_spritesheet_animation(&original);
        cloned.frames.push(3);
        assert_eq!(original.frames, vec![0, 1, 2]);
        assert_eq!(cloned.frames, vec![0, 1, 2, 3]);
    }

    #[test]
    fn clone_spritesheet_frame_deep_copies() {
        let original = create_spritesheet_frame(CreateSpritesheetFrameOptions {
            id: Some(5),
            offset_x: Some(10.0),
            offset_y: Some(20.0),
        });
        let cloned = clone_spritesheet_frame(&original);
        assert_eq!(cloned.id, 5);
        assert_eq!(cloned.offset_x, 10.0);
        assert_eq!(cloned.offset_y, 20.0);
    }

    #[test]
    fn compute_spritesheet_animation_duration_basic() {
        let anim = make_animation(vec![0, 1, 2], 100.0, false);
        assert_eq!(compute_spritesheet_animation_duration(&anim), 300.0);
    }

    #[test]
    fn compute_spritesheet_animation_duration_empty() {
        let anim = make_animation(vec![], 100.0, false);
        assert_eq!(compute_spritesheet_animation_duration(&anim), 0.0);
    }

    #[test]
    fn compute_spritesheet_frame_count_returns_len() {
        let anim = make_animation(vec![0, 1, 2, 3], 100.0, false);
        assert_eq!(compute_spritesheet_frame_count(&anim), 4);
    }

    #[test]
    fn compute_spritesheet_frame_count_empty() {
        let anim = make_animation(vec![], 100.0, false);
        assert_eq!(compute_spritesheet_frame_count(&anim), 0);
    }

    #[test]
    fn create_spritesheet_animation_from_atlas_basic() {
        let sheet = make_sheet(4);
        let anim = create_spritesheet_animation_from_atlas(
            &sheet,
            &[0, 1, 2, 3],
            Some(&CreateSpritesheetAnimationOptions {
                frame_duration: Some(50.0),
                loop_: Some(true),
                ..Default::default()
            }),
        );
        assert_eq!(anim.frames, vec![0, 1, 2, 3]);
        assert_eq!(anim.frame_duration, 50.0);
        assert!(anim.loop_);
    }

    #[test]
    fn create_spritesheet_animation_from_atlas_filters_invalid() {
        let sheet = make_sheet(3);
        let anim = create_spritesheet_animation_from_atlas(&sheet, &[0, 5, 2, 10], None);
        assert_eq!(anim.frames, vec![0, 2]);
    }

    #[test]
    fn create_spritesheet_animation_from_atlas_no_options() {
        let sheet = make_sheet(2);
        let anim = create_spritesheet_animation_from_atlas(&sheet, &[0, 1], None);
        assert_eq!(anim.frames, vec![0, 1]);
        assert_eq!(anim.frame_duration, 0.0);
        assert!(!anim.loop_);
        assert_eq!(anim.origin_x, 0.0);
        assert_eq!(anim.origin_y, 0.0);
    }

    #[test]
    fn enable_spritesheet_signals_is_noop() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        enable_spritesheet_signals(&mut player);
        assert!(player.complete);
    }

    #[test]
    fn get_spritesheet_animation_at_time_basic() {
        let anim = make_animation(vec![0, 1, 2, 3], 100.0, false);
        assert_eq!(get_spritesheet_animation_at_time(&anim, 0.0), Some(0));
        assert_eq!(get_spritesheet_animation_at_time(&anim, 99.0), Some(0));
        assert_eq!(get_spritesheet_animation_at_time(&anim, 100.0), Some(1));
        assert_eq!(get_spritesheet_animation_at_time(&anim, 250.0), Some(2));
    }

    #[test]
    fn get_spritesheet_animation_at_time_loops() {
        let anim = make_animation(vec![0, 1, 2, 3], 100.0, true);
        assert_eq!(get_spritesheet_animation_at_time(&anim, 400.0), Some(0));
        assert_eq!(get_spritesheet_animation_at_time(&anim, 500.0), Some(1));
    }

    #[test]
    fn get_spritesheet_animation_at_time_empty() {
        let anim = make_animation(vec![], 100.0, false);
        assert_eq!(get_spritesheet_animation_at_time(&anim, 50.0), None);
    }

    #[test]
    fn get_spritesheet_animation_at_time_zero_duration() {
        let anim = make_animation(vec![0, 1, 2], 0.0, false);
        assert_eq!(get_spritesheet_animation_at_time(&anim, 0.0), Some(0));
    }

    #[test]
    fn get_spritesheet_animation_frame_at_index_basic() {
        let anim = make_animation(vec![10, 20, 30], 100.0, false);
        assert_eq!(get_spritesheet_animation_frame_at_index(&anim, 0), Some(10));
        assert_eq!(get_spritesheet_animation_frame_at_index(&anim, 1), Some(20));
        assert_eq!(get_spritesheet_animation_frame_at_index(&anim, 2), Some(30));
    }

    #[test]
    fn get_spritesheet_animation_frame_at_index_out_of_bounds() {
        let anim = make_animation(vec![10, 20], 100.0, false);
        assert_eq!(get_spritesheet_animation_frame_at_index(&anim, 5), None);
    }

    #[test]
    fn get_spritesheet_animation_frame_count_returns_len() {
        let anim = make_animation(vec![0, 1, 2], 100.0, false);
        assert_eq!(get_spritesheet_animation_frame_count(&anim), 3);
    }

    #[test]
    fn reset_spritesheet_animation_with_animation() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1, 2], 100.0, true);
        play_spritesheet_animation(&mut player, Some(&anim), true);
        update_spritesheet_player(&mut player, 150.0);
        assert!(player.elapsed > 0.0);

        reset_spritesheet_animation(&mut player);
        assert_eq!(player.elapsed, 0.0);
        assert_eq!(player.frame_index, 0);
        assert!(!player.complete);
        assert!(player.queue.is_empty());
    }

    #[test]
    fn reset_spritesheet_animation_no_animation() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        reset_spritesheet_animation(&mut player);
        assert_eq!(player.elapsed, 0.0);
        assert_eq!(player.frame_index, 0);
        assert!(player.complete);
    }

    #[test]
    fn reset_spritesheet_animation_clears_queue() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1], 100.0, true);
        play_spritesheet_animation(&mut player, Some(&anim), true);
        player.queue.push(make_animation(vec![2, 3], 100.0, false));
        reset_spritesheet_animation(&mut player);
        assert!(player.queue.is_empty());
    }

    #[test]
    fn reverse_spritesheet_animation_reverses_frames() {
        let mut anim = make_animation(vec![0, 1, 2, 3], 100.0, false);
        reverse_spritesheet_animation(&mut anim);
        assert_eq!(anim.frames, vec![3, 2, 1, 0]);
    }

    #[test]
    fn reverse_spritesheet_animation_empty() {
        let mut anim = make_animation(vec![], 100.0, false);
        reverse_spritesheet_animation(&mut anim);
        assert!(anim.frames.is_empty());
    }

    #[test]
    fn set_spritesheet_animation_speed_is_noop() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        set_spritesheet_animation_speed(&mut player, 2.0);
        assert!(player.complete);
    }

    #[test]
    fn update_spritesheet_animation_delegates() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1, 2, 3], 100.0, true);
        play_spritesheet_animation(&mut player, Some(&anim), true);
        let changed = update_spritesheet_animation(&mut player, 100.0);
        assert!(changed);
        assert_eq!(player.frame_index, 1);
    }

    #[test]
    fn update_spritesheet_animation_no_animation() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        assert!(!update_spritesheet_animation(&mut player, 16.0));
    }

    #[test]
    fn update_spritesheet_animation_from_frames_replaces() {
        let mut anim = make_animation(vec![0, 1, 2], 100.0, false);
        update_spritesheet_animation_from_frames(&mut anim, &[5, 6, 7, 8]);
        assert_eq!(anim.frames, vec![5, 6, 7, 8]);
    }

    #[test]
    fn update_spritesheet_animation_from_frames_empty() {
        let mut anim = make_animation(vec![0, 1, 2], 100.0, false);
        update_spritesheet_animation_from_frames(&mut anim, &[]);
        assert!(anim.frames.is_empty());
    }
}
