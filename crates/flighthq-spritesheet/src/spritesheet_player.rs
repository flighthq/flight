use flighthq_signals::Signal;
use flighthq_signals::emit_signal;
use flighthq_types::Spritesheet;
use flighthq_types::SpritesheetAnimation;
use flighthq_types::SpritesheetFrame;
use flighthq_types::SpritesheetPlayer;

/// Builder options for [`create_spritesheet_player`].
pub struct CreateSpritesheetPlayerOptions {
    pub animation: Option<SpritesheetAnimation>,
    pub complete: Option<bool>,
    pub elapsed: Option<f32>,
    pub frame_index: Option<u32>,
    pub on_complete: Option<Signal<()>>,
    pub on_loop: Option<Signal<()>>,
    pub queue: Option<Vec<SpritesheetAnimation>>,
}

impl Default for CreateSpritesheetPlayerOptions {
    fn default() -> Self {
        Self {
            animation: None,
            complete: None,
            elapsed: None,
            frame_index: None,
            on_complete: None,
            on_loop: None,
            queue: None,
        }
    }
}

/// Creates a new [`SpritesheetPlayer`] with the given options, using defaults
/// for any fields not supplied.
///
/// Defaults:
/// - `animation`: `None`
/// - `complete`: `true`
/// - `elapsed`: `0.0`
/// - `frame_index`: `0`
/// - `on_complete` / `on_loop`: fresh signals
/// - `queue`: empty
pub fn create_spritesheet_player(options: CreateSpritesheetPlayerOptions) -> SpritesheetPlayer {
    SpritesheetPlayer {
        animation: options.animation,
        complete: options.complete.unwrap_or(true),
        elapsed: options.elapsed.unwrap_or(0.0),
        frame_index: options.frame_index.unwrap_or(0),
        on_complete: options.on_complete.unwrap_or_default(),
        on_loop: options.on_loop.unwrap_or_default(),
        queue: options.queue.unwrap_or_default(),
    }
}

/// Returns the [`SpritesheetFrame`] that `player` currently points to within
/// `spritesheet`, or `None` if the player has no active animation or the
/// current frame index is out of range.
pub fn get_spritesheet_player_frame<'a>(
    player: &SpritesheetPlayer,
    spritesheet: &'a Spritesheet,
) -> Option<&'a SpritesheetFrame> {
    let animation = player.animation.as_ref()?;
    if animation.frames.is_empty() {
        return None;
    }
    let sprite_frame_index = *animation.frames.get(player.frame_index as usize)?;
    spritesheet.frames.get(sprite_frame_index as usize)
}

/// Starts (or restarts) `animation` on `player`.
///
/// When `restart` is `false` and `animation` is already the active clip,
/// playback continues from its current position unchanged.
/// Passing `None` stops playback and marks the player as complete.
pub fn play_spritesheet_animation(
    player: &mut SpritesheetPlayer,
    animation: Option<&SpritesheetAnimation>,
    restart: bool,
) {
    if !restart && animation == player.animation.as_ref() {
        return;
    }
    player.complete = animation.is_none();
    player.animation = animation.cloned();
    player.elapsed = 0.0;
    player.frame_index = 0;
    player.queue.clear();
}

/// Enqueues `animation` to play after the current clip finishes.
///
/// The queue is drained in order when a non-looping animation completes.
pub fn queue_spritesheet_animation(
    player: &mut SpritesheetPlayer,
    animation: SpritesheetAnimation,
) {
    player.queue.push(animation);
}

/// Advances `player` by `delta_time` milliseconds.
///
/// Returns `true` when the player state changed this tick (frame advanced,
/// looped, or completed). Returns `false` if the player is already complete,
/// has no animation, or the animation has no frames.
///
/// Emits `on_loop` each time the animation wraps and `on_complete` when a
/// non-looping animation reaches its last frame. On completion, the next
/// queued animation (if any) is started automatically.
pub fn update_spritesheet_player(player: &mut SpritesheetPlayer, delta_time: f32) -> bool {
    let (frame_count, frame_duration, loop_) = match player.animation.as_ref() {
        Some(animation) => (
            animation.frames.len(),
            animation.frame_duration,
            animation.loop_,
        ),
        None => return false,
    };
    if player.complete || frame_count == 0 {
        return false;
    }

    let loop_time = frame_count as f32 * frame_duration;
    let prev_loop_count = (player.elapsed / loop_time).floor();

    player.elapsed += delta_time;

    if !loop_ && player.elapsed >= loop_time {
        if !player.queue.is_empty() {
            let next = player.queue.remove(0);
            player.animation = Some(next);
            player.elapsed = 0.0;
            player.frame_index = 0;
            return true;
        }
        player.elapsed = loop_time;
        player.frame_index = (frame_count - 1) as u32;
        player.complete = true;
        emit_signal(&player.on_complete, &());
        return true;
    }

    if (player.elapsed / loop_time).floor() > prev_loop_count {
        emit_signal(&player.on_loop, &());
    }

    let time_in_loop = player.elapsed % loop_time;
    let index = (time_in_loop / frame_duration).floor() as usize;
    player.frame_index = index.min(frame_count - 1) as u32;
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spritesheet::CreateSpritesheetOptions;
    use crate::spritesheet::create_spritesheet;
    use crate::spritesheet_animation::CreateSpritesheetAnimationOptions;
    use crate::spritesheet_animation::create_spritesheet_animation;
    use crate::spritesheet_frame::CreateSpritesheetFrameOptions;
    use crate::spritesheet_frame::create_spritesheet_frame;
    use flighthq_signals::SignalConnectOptions;
    use flighthq_signals::connect_signal;
    use std::sync::Arc;
    use std::sync::atomic::AtomicU32;
    use std::sync::atomic::Ordering;

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
    fn create_spritesheet_player_defaults() {
        let player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        assert!(player.animation.is_none());
        assert!(player.complete);
        assert_eq!(player.elapsed, 0.0);
        assert_eq!(player.frame_index, 0);
        assert!(player.queue.is_empty());
    }

    #[test]
    fn get_spritesheet_player_frame_no_animation() {
        let player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let sheet = make_sheet(4);
        assert!(get_spritesheet_player_frame(&player, &sheet).is_none());
    }

    #[test]
    fn get_spritesheet_player_frame_with_animation() {
        let sheet = make_sheet(4);
        let anim = make_animation(vec![0, 1, 2, 3], 100.0, true);
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        play_spritesheet_animation(&mut player, Some(&anim), true);
        update_spritesheet_player(&mut player, 200.0);
        let frame = get_spritesheet_player_frame(&player, &sheet);
        assert!(frame.is_some());
        assert_eq!(frame.unwrap().id, 2);
    }

    #[test]
    fn get_spritesheet_player_frame_out_of_range() {
        let sheet = make_sheet(1);
        let anim = make_animation(vec![2], 100.0, true);
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        play_spritesheet_animation(&mut player, Some(&anim), true);
        assert!(get_spritesheet_player_frame(&player, &sheet).is_none());
    }

    #[test]
    fn get_spritesheet_player_frame_empty_animation() {
        let sheet = make_sheet(1);
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        play_spritesheet_animation(
            &mut player,
            Some(&make_animation(vec![], 100.0, true)),
            true,
        );
        assert!(get_spritesheet_player_frame(&player, &sheet).is_none());
    }

    #[test]
    fn play_spritesheet_animation_restarts() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1, 2], 100.0, true);
        play_spritesheet_animation(&mut player, Some(&anim), true);
        assert_eq!(player.animation.as_ref(), Some(&anim));
        assert_eq!(player.elapsed, 0.0);
        assert_eq!(player.frame_index, 0);
        assert!(!player.complete);

        player.elapsed = 150.0;
        play_spritesheet_animation(&mut player, Some(&anim), true);
        assert_eq!(player.elapsed, 0.0);
    }

    #[test]
    fn play_spritesheet_animation_no_restart_same_animation() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1, 2], 100.0, true);
        play_spritesheet_animation(&mut player, Some(&anim), true);
        player.elapsed = 150.0;
        play_spritesheet_animation(&mut player, Some(&anim), false);
        assert_eq!(player.elapsed, 150.0);
    }

    #[test]
    fn play_spritesheet_animation_clears_queue() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1], 100.0, true);
        let queued = make_animation(vec![2, 3], 100.0, true);
        play_spritesheet_animation(&mut player, Some(&anim), true);
        queue_spritesheet_animation(&mut player, queued);
        play_spritesheet_animation(&mut player, Some(&anim), true);
        assert!(player.queue.is_empty());
    }

    #[test]
    fn play_spritesheet_animation_none_stops() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1], 100.0, true);
        play_spritesheet_animation(&mut player, Some(&anim), true);
        queue_spritesheet_animation(&mut player, make_animation(vec![2], 100.0, true));
        play_spritesheet_animation(&mut player, None, true);
        assert!(player.animation.is_none());
        assert!(player.complete);
        assert_eq!(player.elapsed, 0.0);
        assert_eq!(player.frame_index, 0);
        assert!(player.queue.is_empty());
    }

    #[test]
    fn queue_spritesheet_animation_appends() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let a1 = make_animation(vec![0], 100.0, true);
        let a2 = make_animation(vec![1], 100.0, true);
        queue_spritesheet_animation(&mut player, a1.clone());
        queue_spritesheet_animation(&mut player, a2.clone());
        assert_eq!(player.queue.len(), 2);
        assert_eq!(player.queue[0], a1);
        assert_eq!(player.queue[1], a2);
    }

    #[test]
    fn update_spritesheet_player_no_animation_returns_false() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        assert!(!update_spritesheet_player(&mut player, 16.0));
    }

    #[test]
    fn update_spritesheet_player_no_frames_returns_false() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        play_spritesheet_animation(
            &mut player,
            Some(&make_animation(vec![], 100.0, true)),
            true,
        );
        assert!(!update_spritesheet_player(&mut player, 16.0));
    }

    #[test]
    fn update_spritesheet_player_advances_frame() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1, 2, 3], 100.0, true);
        play_spritesheet_animation(&mut player, Some(&anim), true);

        update_spritesheet_player(&mut player, 50.0);
        assert_eq!(player.elapsed, 50.0);

        play_spritesheet_animation(&mut player, Some(&anim), true);
        update_spritesheet_player(&mut player, 0.0);
        assert_eq!(player.frame_index, 0);
        update_spritesheet_player(&mut player, 100.0);
        assert_eq!(player.frame_index, 1);
        update_spritesheet_player(&mut player, 100.0);
        assert_eq!(player.frame_index, 2);
    }

    #[test]
    fn update_spritesheet_player_loops_back() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1, 2, 3], 100.0, true);
        play_spritesheet_animation(&mut player, Some(&anim), true);
        update_spritesheet_player(&mut player, 400.0);
        assert_eq!(player.frame_index, 0);
        assert!(!player.complete);
    }

    #[test]
    fn update_spritesheet_player_clamps_and_completes() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1, 2, 3], 100.0, false);
        play_spritesheet_animation(&mut player, Some(&anim), true);
        update_spritesheet_player(&mut player, 500.0);
        assert_eq!(player.frame_index, 3);
        assert!(player.complete);

        let anim2 = make_animation(vec![0, 1], 100.0, false);
        play_spritesheet_animation(&mut player, Some(&anim2), true);
        update_spritesheet_player(&mut player, 300.0);
        assert!(!update_spritesheet_player(&mut player, 100.0));
    }

    #[test]
    fn update_spritesheet_player_complete_drains_queue() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let first = make_animation(vec![0, 1], 100.0, false);
        let second = make_animation(vec![2, 3], 100.0, false);
        play_spritesheet_animation(&mut player, Some(&first), true);
        queue_spritesheet_animation(&mut player, second.clone());
        update_spritesheet_player(&mut player, 300.0);
        assert_eq!(player.animation.as_ref(), Some(&second));
        assert_eq!(player.elapsed, 0.0);
        assert_eq!(player.frame_index, 0);
        assert!(!player.complete);
    }

    #[test]
    fn update_spritesheet_player_queue_does_not_emit_complete() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let first = make_animation(vec![0], 100.0, false);
        let second = make_animation(vec![1], 100.0, false);
        let fired = Arc::new(AtomicU32::new(0));
        let f = fired.clone();
        let _guard = connect_signal(
            &player.on_complete,
            Arc::new(move |_: &()| {
                f.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        play_spritesheet_animation(&mut player, Some(&first), true);
        queue_spritesheet_animation(&mut player, second.clone());
        update_spritesheet_player(&mut player, 200.0);
        assert_eq!(player.animation.as_ref(), Some(&second));
        assert_eq!(fired.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn update_spritesheet_player_plays_through_queue() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let first = make_animation(vec![0], 100.0, false);
        let second = make_animation(vec![1], 100.0, false);
        let third = make_animation(vec![2], 100.0, false);
        play_spritesheet_animation(&mut player, Some(&first), true);
        queue_spritesheet_animation(&mut player, second.clone());
        queue_spritesheet_animation(&mut player, third.clone());

        update_spritesheet_player(&mut player, 200.0);
        assert_eq!(player.animation.as_ref(), Some(&second));
        update_spritesheet_player(&mut player, 200.0);
        assert_eq!(player.animation.as_ref(), Some(&third));
        update_spritesheet_player(&mut player, 200.0);
        assert!(player.complete);
    }

    #[test]
    fn update_spritesheet_player_emits_complete() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1, 2], 100.0, false);
        let fired = Arc::new(AtomicU32::new(0));
        let f = fired.clone();
        let _guard = connect_signal(
            &player.on_complete,
            Arc::new(move |_: &()| {
                f.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        play_spritesheet_animation(&mut player, Some(&anim), true);
        update_spritesheet_player(&mut player, 400.0);
        assert_eq!(fired.load(Ordering::SeqCst), 1);
        update_spritesheet_player(&mut player, 100.0);
        assert_eq!(fired.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn update_spritesheet_player_no_complete_for_loop() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1, 2], 100.0, true);
        let fired = Arc::new(AtomicU32::new(0));
        let f = fired.clone();
        let _guard = connect_signal(
            &player.on_complete,
            Arc::new(move |_: &()| {
                f.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        play_spritesheet_animation(&mut player, Some(&anim), true);
        update_spritesheet_player(&mut player, 400.0);
        assert_eq!(fired.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn update_spritesheet_player_loops_emit_on_loop() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1, 2, 3], 100.0, true);
        let loops = Arc::new(AtomicU32::new(0));
        let l = loops.clone();
        let _guard = connect_signal(
            &player.on_loop,
            Arc::new(move |_: &()| {
                l.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        play_spritesheet_animation(&mut player, Some(&anim), true);
        update_spritesheet_player(&mut player, 400.0);
        assert_eq!(loops.load(Ordering::SeqCst), 1);
        update_spritesheet_player(&mut player, 400.0);
        assert_eq!(loops.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn update_spritesheet_player_no_loop_signal_for_non_looping() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let anim = make_animation(vec![0, 1, 2, 3], 100.0, false);
        let loops = Arc::new(AtomicU32::new(0));
        let l = loops.clone();
        let _guard = connect_signal(
            &player.on_loop,
            Arc::new(move |_: &()| {
                l.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        play_spritesheet_animation(&mut player, Some(&anim), true);
        update_spritesheet_player(&mut player, 500.0);
        assert_eq!(loops.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn update_spritesheet_player_loop_does_not_advance_queue() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        let looping = make_animation(vec![0, 1], 100.0, true);
        let queued = make_animation(vec![2, 3], 100.0, false);
        play_spritesheet_animation(&mut player, Some(&looping), true);
        queue_spritesheet_animation(&mut player, queued);
        update_spritesheet_player(&mut player, 500.0);
        assert_eq!(player.animation.as_ref(), Some(&looping));
        assert_eq!(player.queue.len(), 1);
    }
}
