use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use flight_entity::{Ref, get_entity_id};
use flight_signals::{connect_signal, create_signal};
use flight_spritesheet::contract::*;

use crate::spritesheet_fixture::*;

fn pool() -> SpritesheetPlayerPool {
    let make: fn() -> SpritesheetPlayerPool = SpritesheetPlayerPool::default;
    return make();
}

fn player() -> Ref<SpritesheetPlayer> {
    return create_spritesheet_player();
}

fn counter(signal: &flight_signals::Signal<()>) -> Arc<AtomicUsize> {
    let count = Arc::new(AtomicUsize::new(0));
    let record = count.clone();
    connect_signal(
        signal,
        Arc::new(move |_| {
            record.fetch_add(1, Ordering::SeqCst);
        }),
        None,
    );
    return count;
}

fn emit(signal: &flight_signals::Signal<()>) {
    let emit = signal.emit.read().unwrap().clone();
    emit(&());
}

fn directed(
    direction: SpritesheetAnimationDirection,
    frames: &[f64],
    frame_durations: Option<Vec<f64>>,
) -> Ref<SpritesheetAnimation> {
    let animation = create_spritesheet_animation();
    {
        let mut animation = animation.write().unwrap();
        animation.direction = direction;
        animation.frame_duration = 100.0;
        animation.frame_durations = frame_durations;
        animation.frames = frames.to_vec();
        animation.repeat_count = -1;
    }
    return animation;
}

fn frame_id(frame: Option<Ref<SpritesheetFrame>>) -> i32 {
    return frame.unwrap().read().unwrap().id;
}

fn same(a: &Option<Ref<SpritesheetAnimation>>, b: &Ref<SpritesheetAnimation>) -> bool {
    return a.as_ref().is_some_and(|a| Arc::ptr_eq(a, b));
}

mod acquire_spritesheet_player {
    use super::*;

    #[test]
    fn returns_a_player_in_idle_complete_state() {
        let shared = acquire_spritesheet_player(&mut pool());
        let p = shared.read().unwrap();
        assert!(p.animation.is_none());
        assert!(p.complete && !p.paused);
        assert_eq!(
            (p.elapsed, p.frame_index, p.speed, p.queue.len()),
            (0.0, 0.0, 1.0, 0)
        );
    }

    #[test]
    fn returns_a_previously_released_player_from_the_pool() {
        let mut pool = pool();
        let p = acquire_spritesheet_player(&mut pool);
        release_spritesheet_player(&mut pool, &p);
        assert!(Arc::ptr_eq(&acquire_spritesheet_player(&mut pool), &p));
    }

    #[test]
    fn resets_state_on_reacquire() {
        let mut pool = pool();
        let p = acquire_spritesheet_player(&mut pool);
        play_spritesheet_animation(
            &mut p.write().unwrap(),
            Some(&animation(&[0.0, 1.0], 100.0, -1)),
            None,
        );
        p.write().unwrap().elapsed = 50.0;
        p.write().unwrap().speed = 2.0;
        release_spritesheet_player(&mut pool, &p);
        let again = acquire_spritesheet_player(&mut pool);
        let again = again.read().unwrap();
        assert!(again.animation.is_none());
        assert_eq!((again.elapsed, again.speed), (0.0, 1.0));
    }

    #[test]
    fn resets_a_player_mutated_while_pooled_and_keeps_its_signals() {
        let mut pool = pool();
        let p = acquire_spritesheet_player(&mut pool);
        release_spritesheet_player(&mut pool, &p);
        let count = counter(&p.read().unwrap().on_complete);
        p.write().unwrap().paused = true;
        p.write().unwrap().queue.push(animation(&[0.0], 100.0, 0));
        let again = acquire_spritesheet_player(&mut pool);
        assert!(!again.read().unwrap().paused && again.read().unwrap().queue.is_empty());
        emit(&again.read().unwrap().on_complete);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn pools_a_doubly_released_player_twice_as_the_source_does() {
        let mut pool = pool();
        let p = acquire_spritesheet_player(&mut pool);
        release_spritesheet_player(&mut pool, &p);
        release_spritesheet_player(&mut pool, &p);
        assert!(Arc::ptr_eq(&acquire_spritesheet_player(&mut pool), &p));
        assert!(Arc::ptr_eq(&acquire_spritesheet_player(&mut pool), &p));
    }
}

mod clone_spritesheet_player {
    use super::*;

    #[test]
    fn returns_a_new_player_with_copied_head_state_sharing_the_animation() {
        let shared = player();
        let anim = animation(&[0.0, 1.0, 2.0], 100.0, -1);
        play_spritesheet_animation(&mut shared.write().unwrap(), Some(&anim), None);
        shared.write().unwrap().elapsed = 150.0;
        shared.write().unwrap().frame_index = 1.0;
        let clone = clone_spritesheet_player(&shared.read().unwrap());
        assert!(!Arc::ptr_eq(&clone, &shared));
        let clone = clone.read().unwrap();
        assert!(same(&clone.animation, &anim));
        assert_eq!(
            (clone.elapsed, clone.frame_index, clone.complete),
            (150.0, 1.0, false)
        );
    }

    #[test]
    fn has_independent_signals_from_the_original() {
        let shared = player();
        let clone = clone_spritesheet_player(&shared.read().unwrap());
        let original_count = counter(&shared.read().unwrap().on_complete);
        emit(&clone.read().unwrap().on_complete);
        assert_eq!(original_count.load(Ordering::SeqCst), 0);
        assert!(!Arc::ptr_eq(
            &clone.read().unwrap().on_loop.data,
            &shared.read().unwrap().on_loop.data
        ));
    }

    #[test]
    fn has_an_independent_queue_holding_the_same_animations() {
        let shared = player();
        let anim = animation(&[0.0], 100.0, -1);
        queue_spritesheet_animation(&mut shared.write().unwrap(), &anim);
        let clone = clone_spritesheet_player(&shared.read().unwrap());
        clone.write().unwrap().queue.clear();
        assert_eq!(shared.read().unwrap().queue.len(), 1);
        let clone = clone_spritesheet_player(&shared.read().unwrap());
        assert!(Arc::ptr_eq(&clone.read().unwrap().queue[0], &anim));
    }
}

mod create_spritesheet_player {
    use super::*;

    #[test]
    fn starts_complete_with_no_animation() {
        let shared = player();
        let p = shared.read().unwrap();
        assert!(p.animation.is_none() && p.complete && p.queue.is_empty());
        assert_eq!((p.elapsed, p.frame_index), (0.0, 0.0));
    }

    #[test]
    fn accepts_authored_queue_and_signals_directly_after_construction() {
        let anim = animation(&[0.0], 100.0, -1);
        let queue = vec![anim.clone()];
        let address = queue.as_ptr();
        let on_complete = create_signal::<()>();
        let count = counter(&on_complete);
        let shared = create_spritesheet_player();
        {
            let mut player = shared.write().unwrap();
            player.queue = queue;
            player.on_complete = on_complete;
        }
        assert_eq!(shared.read().unwrap().queue.as_ptr(), address);
        emit(&shared.read().unwrap().on_complete);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }
}

mod dispose_spritesheet_player {
    use super::*;

    #[test]
    fn clears_animation_and_marks_complete() {
        let shared = player();
        let mut p = shared.write().unwrap();
        play_spritesheet_animation(&mut p, Some(&animation(&[0.0], 100.0, -1)), None);
        queue_spritesheet_animation(&mut p, &animation(&[0.0], 100.0, -1));
        p.elapsed = 30.0;
        dispose_spritesheet_player(&mut p);
        assert!(p.animation.is_none() && p.complete && p.queue.is_empty());
        assert_eq!(
            p.elapsed, 30.0,
            "dispose leaves the head time as the source does"
        );
    }

    #[test]
    fn disconnects_on_complete_and_on_loop_slots() {
        let shared = player();
        let complete = counter(&shared.read().unwrap().on_complete);
        let looped = counter(&shared.read().unwrap().on_loop);
        dispose_spritesheet_player(&mut shared.write().unwrap());
        emit(&shared.read().unwrap().on_complete);
        emit(&shared.read().unwrap().on_loop);
        assert_eq!(
            (
                complete.load(Ordering::SeqCst),
                looped.load(Ordering::SeqCst)
            ),
            (0, 0)
        );
    }
}

mod get_spritesheet_player_frame {
    use super::*;

    #[test]
    fn returns_null_when_no_animation_or_no_frames() {
        let shared = player();
        assert!(get_spritesheet_player_frame(&shared.read().unwrap(), &sheet(4)).is_none());
        play_spritesheet_animation(
            &mut shared.write().unwrap(),
            Some(&animation(&[], 100.0, -1)),
            None,
        );
        assert!(get_spritesheet_player_frame(&shared.read().unwrap(), &sheet(1)).is_none());
    }

    #[test]
    fn returns_the_sheet_frame_for_the_current_frame_index() {
        let sheet = sheet(4);
        let shared = player();
        play_spritesheet_animation(
            &mut shared.write().unwrap(),
            Some(&animation(&[0.0, 1.0, 2.0, 3.0], 100.0, -1)),
            None,
        );
        update_spritesheet_player(&mut shared.write().unwrap(), 200.0);
        let frame = get_spritesheet_player_frame(&shared.read().unwrap(), &sheet).unwrap();
        assert!(Arc::ptr_eq(&frame, &sheet.frames[2]));
    }

    #[test]
    fn returns_null_when_the_animation_frame_points_outside_the_sheet() {
        let shared = player();
        play_spritesheet_animation(
            &mut shared.write().unwrap(),
            Some(&animation(&[2.0], 100.0, -1)),
            None,
        );
        assert!(get_spritesheet_player_frame(&shared.read().unwrap(), &sheet(1)).is_none());
    }

    #[test]
    fn resolves_no_frame_for_a_non_integral_or_nan_index() {
        let shared = player();
        play_spritesheet_animation(
            &mut shared.write().unwrap(),
            Some(&animation(&[0.0, 1.0], 100.0, -1)),
            None,
        );
        shared.write().unwrap().frame_index = 0.5;
        assert!(get_spritesheet_player_frame(&shared.read().unwrap(), &sheet(2)).is_none());
        shared.write().unwrap().frame_index = f64::NAN;
        assert!(get_spritesheet_player_frame(&shared.read().unwrap(), &sheet(2)).is_none());
    }
}

mod get_spritesheet_player_frame_at {
    use super::*;

    fn playing(frames: &[f64], advance: f64) -> Ref<SpritesheetPlayer> {
        let shared = player();
        play_spritesheet_animation(
            &mut shared.write().unwrap(),
            Some(&animation(frames, 100.0, -1)),
            None,
        );
        update_spritesheet_player(&mut shared.write().unwrap(), advance);
        return shared;
    }

    #[test]
    fn returns_null_when_no_animation_or_no_frames() {
        assert!(
            get_spritesheet_player_frame_at(&player().read().unwrap(), &sheet(4), 0.0).is_none()
        );
        let shared = player();
        play_spritesheet_animation(
            &mut shared.write().unwrap(),
            Some(&animation(&[], 100.0, -1)),
            None,
        );
        assert!(get_spritesheet_player_frame_at(&shared.read().unwrap(), &sheet(4), 0.0).is_none());
    }

    #[test]
    fn returns_the_current_and_next_frames() {
        let shared = playing(&[0.0, 1.0, 2.0, 3.0], 100.0);
        assert_eq!(
            frame_id(get_spritesheet_player_frame_at(
                &shared.read().unwrap(),
                &sheet(4),
                0.0
            )),
            1
        );
        assert_eq!(
            frame_id(get_spritesheet_player_frame_at(
                &shared.read().unwrap(),
                &sheet(4),
                1.0
            )),
            2
        );
    }

    #[test]
    fn wraps_forward_and_backward() {
        let ahead = playing(&[0.0, 1.0, 2.0], 200.0);
        assert_eq!(
            frame_id(get_spritesheet_player_frame_at(
                &ahead.read().unwrap(),
                &sheet(3),
                1.0
            )),
            0
        );
        let start = playing(&[0.0, 1.0, 2.0], 0.0);
        assert_eq!(
            frame_id(get_spritesheet_player_frame_at(
                &start.read().unwrap(),
                &sheet(3),
                -1.0
            )),
            2
        );
        assert_eq!(
            frame_id(get_spritesheet_player_frame_at(
                &start.read().unwrap(),
                &sheet(3),
                -7.0
            )),
            2
        );
    }

    #[test]
    fn does_not_mutate_player_state() {
        let shared = playing(&[0.0, 1.0, 2.0, 3.0], 0.0);
        get_spritesheet_player_frame_at(&shared.read().unwrap(), &sheet(4), 2.0);
        assert_eq!(
            (
                shared.read().unwrap().frame_index,
                shared.read().unwrap().elapsed
            ),
            (0.0, 0.0)
        );
    }
}

mod initialize_spritesheet_player {
    use super::*;

    #[test]
    fn is_the_construction_initializer_with_fresh_signals() {
        let shared = create_spritesheet_player();
        shared.write().unwrap().speed = 3.0;
        let entity_id = get_entity_id(&*shared.read().unwrap());
        let old = counter(&shared.read().unwrap().on_complete);
        initialize_spritesheet_player(&mut shared.write().unwrap());
        assert_eq!(get_entity_id(&*shared.read().unwrap()), entity_id);
        assert_eq!(shared.read().unwrap().speed, 1.0);
        emit(&shared.read().unwrap().on_complete);
        assert_eq!(old.load(Ordering::SeqCst), 0);
    }
}

mod pause_spritesheet_player {
    use super::*;

    #[test]
    fn sets_paused_to_true() {
        let shared = player();
        pause_spritesheet_player(&mut shared.write().unwrap());
        assert!(shared.read().unwrap().paused);
    }
}

mod play_spritesheet_animation {
    use super::*;

    #[test]
    fn sets_the_animation_and_resets_state() {
        let shared = player();
        let anim = animation(&[0.0, 1.0, 2.0], 100.0, -1);
        play_spritesheet_animation(&mut shared.write().unwrap(), Some(&anim), None);
        let p = shared.read().unwrap();
        assert!(same(&p.animation, &anim));
        assert_eq!((p.elapsed, p.frame_index, p.complete), (0.0, 0.0, false));
    }

    #[test]
    fn clears_the_queue() {
        let shared = player();
        let anim = animation(&[0.0, 1.0], 100.0, -1);
        let mut p = shared.write().unwrap();
        play_spritesheet_animation(&mut p, Some(&anim), None);
        queue_spritesheet_animation(&mut p, &animation(&[2.0, 3.0], 100.0, -1));
        play_spritesheet_animation(&mut p, Some(&anim), None);
        assert!(p.queue.is_empty());
    }

    #[test]
    fn does_not_restart_the_same_animation_with_restart_false_but_does_with_true() {
        let shared = player();
        let anim = animation(&[0.0, 1.0, 2.0], 100.0, -1);
        let mut p = shared.write().unwrap();
        play_spritesheet_animation(&mut p, Some(&anim), None);
        p.elapsed = 150.0;
        play_spritesheet_animation(&mut p, Some(&anim), Some(false));
        assert_eq!(p.elapsed, 150.0);
        play_spritesheet_animation(&mut p, Some(&anim), Some(true));
        assert_eq!(p.elapsed, 0.0);
    }

    #[test]
    fn restart_false_with_a_different_or_equal_valued_animation_still_plays() {
        let shared = player();
        let mut p = shared.write().unwrap();
        play_spritesheet_animation(&mut p, Some(&animation(&[0.0], 100.0, -1)), None);
        p.elapsed = 50.0;
        play_spritesheet_animation(&mut p, Some(&animation(&[0.0], 100.0, -1)), Some(false));
        assert_eq!(p.elapsed, 0.0);
    }

    #[test]
    fn clears_the_animation_and_marks_complete_for_null() {
        let shared = player();
        let mut p = shared.write().unwrap();
        play_spritesheet_animation(&mut p, Some(&animation(&[0.0, 1.0], 100.0, -1)), None);
        queue_spritesheet_animation(&mut p, &animation(&[2.0], 100.0, -1));
        play_spritesheet_animation(&mut p, None, None);
        assert!(p.animation.is_none() && p.complete && p.queue.is_empty());
        assert_eq!((p.elapsed, p.frame_index), (0.0, 0.0));
    }
}

mod queue_spritesheet_animation {
    use super::*;

    #[test]
    fn appends_animations_in_order() {
        let shared = player();
        let (a1, a2) = (animation(&[0.0], 100.0, -1), animation(&[1.0], 100.0, -1));
        let mut p = shared.write().unwrap();
        queue_spritesheet_animation(&mut p, &a1);
        queue_spritesheet_animation(&mut p, &a2);
        assert!(Arc::ptr_eq(&p.queue[0], &a1) && Arc::ptr_eq(&p.queue[1], &a2));
    }
}

mod release_spritesheet_player {
    use super::*;

    #[test]
    fn resets_all_fields_to_idle_state() {
        let mut pool = pool();
        let shared = player();
        {
            let mut p = shared.write().unwrap();
            play_spritesheet_animation(&mut p, Some(&animation(&[0.0, 1.0], 100.0, -1)), None);
            p.elapsed = 80.0;
            p.speed = 3.0;
            p.paused = true;
        }
        release_spritesheet_player(&mut pool, &shared);
        let p = shared.read().unwrap();
        assert!(p.animation.is_none() && p.complete && !p.paused && p.queue.is_empty());
        assert_eq!((p.elapsed, p.frame_index, p.speed), (0.0, 0.0, 1.0));
    }

    #[test]
    fn disconnects_signals_so_they_do_not_fire_after_release() {
        let shared = player();
        let count = counter(&shared.read().unwrap().on_complete);
        release_spritesheet_player(&mut pool(), &shared);
        emit(&shared.read().unwrap().on_complete);
        assert_eq!(count.load(Ordering::SeqCst), 0);
    }
}

mod resume_spritesheet_player {
    use super::*;

    #[test]
    fn sets_paused_to_false() {
        let shared = create_spritesheet_player();
        shared.write().unwrap().paused = true;
        resume_spritesheet_player(&mut shared.write().unwrap());
        assert!(!shared.read().unwrap().paused);
    }
}

mod seek_spritesheet_player_to_frame {
    use super::*;

    fn seek(anim: &Ref<SpritesheetAnimation>, frame: f64) -> (f64, f64, f64) {
        let shared = player();
        let mut p = shared.write().unwrap();
        play_spritesheet_animation(&mut p, Some(anim), None);
        seek_spritesheet_player_to_frame(&mut p, frame);
        let (elapsed, index) = (p.elapsed, p.frame_index);
        update_spritesheet_player(&mut p, 0.0);
        return (elapsed, index, p.frame_index);
    }

    #[test]
    fn sets_frame_index_to_the_target_frame() {
        assert_eq!(
            seek(&animation(&[0.0, 1.0, 2.0, 3.0], 100.0, -1), 2.0),
            (200.0, 2.0, 2.0)
        );
    }

    #[test]
    fn converts_reverse_pingpong_and_pingpong_reverse_display_frames_to_their_first_virtual_start()
    {
        let frames = [0.0, 1.0, 2.0, 3.0];
        assert_eq!(
            seek(
                &directed(SpritesheetAnimationDirection::Reverse, &frames, None),
                1.0
            ),
            (200.0, 1.0, 1.0)
        );
        assert_eq!(
            seek(
                &directed(SpritesheetAnimationDirection::Pingpong, &frames, None),
                2.0
            ),
            (200.0, 2.0, 2.0)
        );
        assert_eq!(
            seek(
                &directed(
                    SpritesheetAnimationDirection::PingpongReverse,
                    &frames,
                    None
                ),
                2.0
            ),
            (100.0, 2.0, 2.0)
        );
    }

    #[test]
    fn uses_cumulative_start_times_for_variable_durations() {
        let anim = directed(
            SpritesheetAnimationDirection::Forward,
            &[0.0, 1.0, 2.0],
            Some(vec![50.0, 200.0, 150.0]),
        );
        assert_eq!(seek(&anim, 2.0), (250.0, 2.0, 2.0));
    }

    #[test]
    fn clamps_the_frame_index_into_range() {
        assert_eq!(seek(&animation(&[0.0, 1.0, 2.0], 100.0, -1), -1.0).1, 0.0);
        assert_eq!(seek(&animation(&[0.0, 1.0, 2.0], 100.0, -1), 99.0).1, 2.0);
    }

    #[test]
    fn is_a_no_op_without_an_animation_or_frames() {
        let shared = player();
        seek_spritesheet_player_to_frame(&mut shared.write().unwrap(), 2.0);
        assert_eq!(shared.read().unwrap().frame_index, 0.0);
        play_spritesheet_animation(
            &mut shared.write().unwrap(),
            Some(&animation(&[], 100.0, -1)),
            None,
        );
        seek_spritesheet_player_to_frame(&mut shared.write().unwrap(), 2.0);
        assert_eq!(shared.read().unwrap().frame_index, 0.0);
    }

    #[test]
    fn a_non_integral_frame_on_a_variable_animation_has_no_start_time() {
        let anim = directed(
            SpritesheetAnimationDirection::Forward,
            &[0.0, 1.0, 2.0],
            Some(vec![50.0, 50.0, 50.0]),
        );
        let shared = player();
        let mut p = shared.write().unwrap();
        play_spritesheet_animation(&mut p, Some(&anim), None);
        seek_spritesheet_player_to_frame(&mut p, 1.5);
        assert_eq!(p.frame_index, 1.5);
        assert!(p.elapsed.is_nan());
    }
}

mod seek_spritesheet_player_to_time {
    use super::*;

    #[test]
    fn sets_elapsed_and_the_frame() {
        let shared = player();
        let mut p = shared.write().unwrap();
        play_spritesheet_animation(
            &mut p,
            Some(&animation(&[0.0, 1.0, 2.0, 3.0], 100.0, -1)),
            None,
        );
        seek_spritesheet_player_to_time(&mut p, 250.0);
        assert_eq!((p.elapsed, p.frame_index), (250.0, 2.0));
    }

    #[test]
    fn clamps_to_zero_and_to_one_loop() {
        let shared = player();
        let mut p = shared.write().unwrap();
        play_spritesheet_animation(&mut p, Some(&animation(&[0.0, 1.0, 2.0], 100.0, -1)), None);
        seek_spritesheet_player_to_time(&mut p, -50.0);
        assert_eq!(p.elapsed, 0.0);
        seek_spritesheet_player_to_time(&mut p, 1000.0);
        assert_eq!((p.elapsed, p.frame_index), (300.0, 0.0));
    }

    #[test]
    fn is_a_no_op_when_no_animation_is_set() {
        let shared = player();
        seek_spritesheet_player_to_time(&mut shared.write().unwrap(), 100.0);
        assert_eq!(shared.read().unwrap().elapsed, 0.0);
    }
}

mod stop_spritesheet_player {
    use super::*;

    #[test]
    fn resets_elapsed_and_frame_index_marks_complete_and_keeps_the_animation() {
        let shared = player();
        let anim = animation(&[0.0, 1.0, 2.0], 100.0, -1);
        let mut p = shared.write().unwrap();
        play_spritesheet_animation(&mut p, Some(&anim), None);
        queue_spritesheet_animation(&mut p, &animation(&[3.0], 100.0, -1));
        p.elapsed = 150.0;
        p.frame_index = 1.0;
        stop_spritesheet_player(&mut p);
        assert_eq!(
            (p.elapsed, p.frame_index, p.complete, p.queue.len()),
            (0.0, 0.0, true, 0)
        );
        assert!(same(&p.animation, &anim));
    }
}

mod update_spritesheet_player {
    use super::*;

    fn play(anim: &Ref<SpritesheetAnimation>) -> Ref<SpritesheetPlayer> {
        let shared = player();
        play_spritesheet_animation(&mut shared.write().unwrap(), Some(anim), None);
        return shared;
    }

    fn step(shared: &Ref<SpritesheetPlayer>, delta: f64) -> bool {
        return update_spritesheet_player(&mut shared.write().unwrap(), delta);
    }

    fn index(shared: &Ref<SpritesheetPlayer>) -> f64 {
        return shared.read().unwrap().frame_index;
    }

    #[test]
    fn returns_false_without_an_animation_or_frames() {
        assert!(!step(&player(), 16.0));
        assert!(!step(&play(&animation(&[], 100.0, -1)), 16.0));
    }

    #[test]
    fn advances_elapsed_time_and_selects_the_frame() {
        let shared = play(&animation(&[0.0, 1.0, 2.0, 3.0], 100.0, -1));
        assert!(step(&shared, 50.0));
        assert_eq!(shared.read().unwrap().elapsed, 50.0);
        step(&shared, 50.0);
        assert_eq!(index(&shared), 1.0);
        step(&shared, 100.0);
        assert_eq!(index(&shared), 2.0);
    }

    #[test]
    fn loops_back_to_frame_0_after_a_full_loop() {
        let shared = play(&animation(&[0.0, 1.0, 2.0, 3.0], 100.0, -1));
        step(&shared, 400.0);
        assert_eq!(index(&shared), 0.0);
        assert!(!shared.read().unwrap().complete);
    }

    #[test]
    fn clamps_to_the_last_frame_and_completes_when_repeat_count_is_zero() {
        let shared = play(&animation(&[0.0, 1.0, 2.0, 3.0], 100.0, 0));
        step(&shared, 500.0);
        assert_eq!(
            (index(&shared), shared.read().unwrap().elapsed),
            (3.0, 400.0)
        );
        assert!(shared.read().unwrap().complete);
        assert!(!step(&shared, 100.0));
    }

    #[test]
    fn advances_to_queued_animations_in_order_without_emitting_completion() {
        let (first, second, third) = (
            animation(&[0.0], 100.0, 0),
            animation(&[1.0], 100.0, 0),
            animation(&[2.0], 100.0, 0),
        );
        let shared = play(&first);
        let completions = counter(&shared.read().unwrap().on_complete);
        queue_spritesheet_animation(&mut shared.write().unwrap(), &second);
        queue_spritesheet_animation(&mut shared.write().unwrap(), &third);
        assert!(step(&shared, 200.0));
        assert!(same(&shared.read().unwrap().animation, &second));
        assert_eq!(
            (
                shared.read().unwrap().elapsed,
                index(&shared),
                shared.read().unwrap().complete
            ),
            (0.0, 0.0, false)
        );
        step(&shared, 200.0);
        assert!(same(&shared.read().unwrap().animation, &third));
        assert_eq!(completions.load(Ordering::SeqCst), 0);
        step(&shared, 200.0);
        assert!(shared.read().unwrap().complete);
        assert_eq!(completions.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn emits_on_complete_once_when_a_zero_repeat_animation_finishes() {
        let shared = play(&animation(&[0.0, 1.0, 2.0], 100.0, 0));
        let fired = counter(&shared.read().unwrap().on_complete);
        step(&shared, 400.0);
        step(&shared, 100.0);
        assert_eq!(fired.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn never_completes_an_infinitely_repeating_animation_or_advances_its_queue() {
        let looping = animation(&[0.0, 1.0], 100.0, -1);
        let shared = play(&looping);
        let fired = counter(&shared.read().unwrap().on_complete);
        queue_spritesheet_animation(
            &mut shared.write().unwrap(),
            &animation(&[2.0, 3.0], 100.0, 0),
        );
        step(&shared, 500.0);
        assert!(same(&shared.read().unwrap().animation, &looping));
        assert_eq!(
            (
                shared.read().unwrap().queue.len(),
                fired.load(Ordering::SeqCst)
            ),
            (1, 0)
        );
    }

    #[test]
    fn emits_on_loop_once_per_update_that_crosses_loop_boundaries() {
        let shared = play(&animation(&[0.0, 1.0, 2.0, 3.0], 100.0, -1));
        let loops = counter(&shared.read().unwrap().on_loop);
        step(&shared, 400.0);
        assert_eq!(loops.load(Ordering::SeqCst), 1);
        step(&shared, 400.0);
        assert_eq!(loops.load(Ordering::SeqCst), 2);
        step(&shared, 1200.0);
        assert_eq!(
            loops.load(Ordering::SeqCst),
            3,
            "a large delta crossing three boundaries emits once"
        );
    }

    #[test]
    fn does_not_emit_on_loop_when_repeat_count_is_zero() {
        let shared = play(&animation(&[0.0, 1.0, 2.0, 3.0], 100.0, 0));
        let loops = counter(&shared.read().unwrap().on_loop);
        step(&shared, 500.0);
        assert_eq!(loops.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn plays_repeat_count_additional_cycles_before_completing() {
        let shared = play(&animation(&[0.0, 1.0], 100.0, 2));
        let completions = counter(&shared.read().unwrap().on_complete);
        let loops = counter(&shared.read().unwrap().on_loop);
        step(&shared, 200.0);
        assert!(!shared.read().unwrap().complete);
        assert_eq!(loops.load(Ordering::SeqCst), 1);
        step(&shared, 200.0);
        assert_eq!(loops.load(Ordering::SeqCst), 2);
        step(&shared, 200.0);
        assert!(shared.read().unwrap().complete);
        assert_eq!(
            (shared.read().unwrap().elapsed, index(&shared)),
            (600.0, 1.0)
        );
        assert_eq!(
            (
                loops.load(Ordering::SeqCst),
                completions.load(Ordering::SeqCst)
            ),
            (2, 1)
        );
    }

    #[test]
    fn does_not_advance_while_paused_and_resumes_after() {
        let shared = play(&animation(&[0.0, 1.0, 2.0], 100.0, -1));
        pause_spritesheet_player(&mut shared.write().unwrap());
        assert!(!step(&shared, 200.0));
        assert_eq!(shared.read().unwrap().elapsed, 0.0);
        resume_spritesheet_player(&mut shared.write().unwrap());
        step(&shared, 100.0);
        assert_eq!(shared.read().unwrap().elapsed, 100.0);
    }

    #[test]
    fn scales_elapsed_time_by_speed() {
        let shared = create_spritesheet_player();
        shared.write().unwrap().speed = 2.0;
        play_spritesheet_animation(
            &mut shared.write().unwrap(),
            Some(&animation(&[0.0, 1.0, 2.0, 3.0], 100.0, -1)),
            None,
        );
        step(&shared, 100.0);
        assert_eq!(
            (shared.read().unwrap().elapsed, index(&shared)),
            (200.0, 2.0)
        );
    }

    #[test]
    fn plays_reverse_direction_in_reverse_frame_order() {
        let shared = play(&directed(
            SpritesheetAnimationDirection::Reverse,
            &[0.0, 1.0, 2.0, 3.0],
            None,
        ));
        step(&shared, 0.0);
        assert_eq!(index(&shared), 3.0);
        step(&shared, 100.0);
        assert_eq!(index(&shared), 2.0);
    }

    #[test]
    fn uses_the_displayed_reverse_frame_duration_rather_than_its_mirrored_index() {
        let shared = play(&directed(
            SpritesheetAnimationDirection::Reverse,
            &[0.0, 1.0, 2.0],
            Some(vec![50.0, 100.0, 200.0]),
        ));
        step(&shared, 199.0);
        assert_eq!(index(&shared), 2.0);
        step(&shared, 1.0);
        assert_eq!(index(&shared), 1.0);
    }

    #[test]
    fn plays_pingpong_forward_then_backward() {
        let shared = play(&directed(
            SpritesheetAnimationDirection::Pingpong,
            &[0.0, 1.0, 2.0],
            None,
        ));
        let mut seen = Vec::new();
        for delta in [0.0, 100.0, 100.0, 100.0, 100.0] {
            step(&shared, delta);
            seen.push(index(&shared));
        }
        assert_eq!(seen, vec![0.0, 1.0, 2.0, 1.0, 0.0]);
    }

    #[test]
    fn uses_direction_aware_durations_for_pingpong_reverse_playback() {
        let shared = play(&directed(
            SpritesheetAnimationDirection::PingpongReverse,
            &[0.0, 1.0, 2.0],
            Some(vec![50.0, 100.0, 200.0]),
        ));
        step(&shared, 199.0);
        assert_eq!(index(&shared), 2.0);
        step(&shared, 1.0);
        assert_eq!(index(&shared), 1.0);
    }

    #[test]
    fn uses_per_frame_durations_when_set() {
        let shared = play(&directed(
            SpritesheetAnimationDirection::Forward,
            &[0.0, 1.0, 2.0],
            Some(vec![50.0, 200.0, 150.0]),
        ));
        step(&shared, 50.0);
        assert_eq!(index(&shared), 1.0);
        step(&shared, 200.0);
        assert_eq!(index(&shared), 2.0);
    }

    #[test]
    fn falls_back_to_frame_duration_for_missing_per_frame_entries() {
        let shared = play(&directed(
            SpritesheetAnimationDirection::Forward,
            &[0.0, 1.0, 2.0],
            Some(vec![50.0]),
        ));
        step(&shared, 149.0);
        assert_eq!(index(&shared), 1.0);
        step(&shared, 1.0);
        assert_eq!(index(&shared), 2.0);
    }

    #[test]
    fn keeps_the_cumulative_durations_computed_on_first_use() {
        let anim = directed(
            SpritesheetAnimationDirection::Forward,
            &[0.0, 1.0],
            Some(vec![100.0, 100.0]),
        );
        let shared = play(&anim);
        step(&shared, 150.0);
        assert_eq!(index(&shared), 1.0);
        anim.write().unwrap().frame_durations = Some(vec![1000.0, 1000.0]);
        step(&shared, 100.0);
        assert_eq!(
            index(&shared),
            0.0,
            "the source's per-animation cache is not invalidated by edits"
        );
    }

    #[test]
    fn a_zero_duration_animation_produces_the_source_nan_index_on_a_loop_boundary() {
        let shared = play(&animation(&[0.0, 1.0], 0.0, -1));
        assert!(step(&shared, 16.0));
        assert!(index(&shared).is_nan());
        assert!(get_spritesheet_player_frame(&shared.read().unwrap(), &sheet(2)).is_none());
    }

    #[test]
    fn a_single_frame_pingpong_has_one_virtual_frame() {
        let shared = play(&directed(
            SpritesheetAnimationDirection::Pingpong,
            &[4.0],
            None,
        ));
        let loops = counter(&shared.read().unwrap().on_loop);
        step(&shared, 100.0);
        assert_eq!((index(&shared), loops.load(Ordering::SeqCst)), (0.0, 1));
    }
}
