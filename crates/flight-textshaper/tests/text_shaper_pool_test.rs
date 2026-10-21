use std::sync::{Arc, Mutex};

use flight_entity::Ref;
use flight_textshaper::contract::*;

fn pool() -> ShapedRunPool {
    let make: fn() -> ShapedRunPool = ShapedRunPool::default;
    return make();
}

mod acquire_shaped_run {
    use super::*;

    #[test]
    fn returns_an_empty_shaped_run_from_an_empty_pool() {
        let mut pool = pool();
        let run = acquire_shaped_run(&mut pool);
        assert_eq!(run.read().unwrap().glyph_count, 0);
        release_shaped_run(&mut pool, &run);
    }

    #[test]
    fn returns_a_previously_released_run_from_the_pool() {
        let mut pool = pool();
        let run = acquire_shaped_run(&mut pool);
        release_shaped_run(&mut pool, &run);
        assert!(Arc::ptr_eq(&acquire_shaped_run(&mut pool), &run));
    }

    #[test]
    fn allocates_a_new_run_when_the_pool_is_empty() {
        let mut pool = pool();
        let (first, second) = (acquire_shaped_run(&mut pool), acquire_shaped_run(&mut pool));
        assert!(!Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn hands_out_the_most_recently_released_run_first() {
        let mut pool = pool();
        let (first, second) = (acquire_shaped_run(&mut pool), acquire_shaped_run(&mut pool));
        release_shaped_run(&mut pool, &first);
        release_shaped_run(&mut pool, &second);
        assert!(Arc::ptr_eq(&acquire_shaped_run(&mut pool), &second));
        assert!(Arc::ptr_eq(&acquire_shaped_run(&mut pool), &first));
    }

    #[test]
    fn does_not_reset_a_pooled_run() {
        let mut pool = pool();
        let run = acquire_shaped_run(&mut pool);
        run.write().unwrap().advance_width = 5.0;
        release_shaped_run(&mut pool, &run);
        assert_eq!(
            acquire_shaped_run(&mut pool).read().unwrap().advance_width,
            5.0
        );
    }
}

mod release_shaped_run {
    use super::*;

    #[test]
    fn ignores_a_second_release_of_the_same_run_so_two_acquires_stay_distinct() {
        let mut pool = pool();
        let run = acquire_shaped_run(&mut pool);
        release_shaped_run(&mut pool, &run);
        release_shaped_run(&mut pool, &run);
        let (first, second) = (acquire_shaped_run(&mut pool), acquire_shaped_run(&mut pool));
        assert!(!Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn accepts_a_release_again_after_the_run_has_been_re_acquired() {
        let mut pool = pool();
        let run = acquire_shaped_run(&mut pool);
        release_shaped_run(&mut pool, &run);
        let reacquired = acquire_shaped_run(&mut pool);
        assert!(Arc::ptr_eq(&reacquired, &run));
        release_shaped_run(&mut pool, &reacquired);
        assert!(Arc::ptr_eq(&acquire_shaped_run(&mut pool), &run));
    }

    #[test]
    fn keeps_distinct_runs_distinct_through_an_acquire_release_cycle() {
        let mut pool = pool();
        let (first, second) = (acquire_shaped_run(&mut pool), acquire_shaped_run(&mut pool));
        release_shaped_run(&mut pool, &first);
        release_shaped_run(&mut pool, &second);
        let (a, b) = (acquire_shaped_run(&mut pool), acquire_shaped_run(&mut pool));
        assert!(!Arc::ptr_eq(&a, &b));
    }

    #[test]
    fn drops_releases_past_the_64_run_capacity() {
        let mut pool = pool();
        let runs: Vec<Ref<ShapedRun>> = (0..65).map(|_| acquire_shaped_run(&mut pool)).collect();
        for run in &runs {
            release_shaped_run(&mut pool, run);
        }
        let reacquired: Vec<Ref<ShapedRun>> =
            (0..65).map(|_| acquire_shaped_run(&mut pool)).collect();
        let pooled = reacquired
            .iter()
            .filter(|run| runs.iter().any(|old| Arc::ptr_eq(old, run)))
            .count();
        assert_eq!(pooled, 64);
        assert!(!reacquired.iter().any(|run| Arc::ptr_eq(run, &runs[64])));
    }

    #[test]
    fn keeps_separate_pools_separate() {
        let (mut a, mut b) = (pool(), pool());
        let run = acquire_shaped_run(&mut a);
        release_shaped_run(&mut a, &run);
        assert!(!Arc::ptr_eq(&acquire_shaped_run(&mut b), &run));
    }
}

mod set_shaped_run_release_guard {
    use super::*;

    fn recorder() -> (ShapedRunReleaseGuard, Arc<Mutex<Vec<Ref<ShapedRun>>>>) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let record = seen.clone();
        let guard: ShapedRunReleaseGuard =
            Arc::new(move |run| record.lock().unwrap().push(run.clone()));
        return (guard, seen);
    }

    #[test]
    fn reports_a_repeated_release_after_core_detects_it() {
        let mut pool = pool();
        let (guard, seen) = recorder();
        let run = acquire_shaped_run(&mut pool);
        set_shaped_run_release_guard(&mut pool, Some(guard));
        release_shaped_run(&mut pool, &run);
        release_shaped_run(&mut pool, &run);
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert!(Arc::ptr_eq(&seen[0], &run));
    }

    #[test]
    fn stays_silent_for_paired_reuse_and_after_being_cleared() {
        let mut pool = pool();
        let (guard, seen) = recorder();
        let run = acquire_shaped_run(&mut pool);
        set_shaped_run_release_guard(&mut pool, Some(guard));
        release_shaped_run(&mut pool, &run);
        let reacquired = acquire_shaped_run(&mut pool);
        release_shaped_run(&mut pool, &reacquired);
        assert!(seen.lock().unwrap().is_empty());
        set_shaped_run_release_guard(&mut pool, None);
        release_shaped_run(&mut pool, &reacquired);
        assert!(seen.lock().unwrap().is_empty());
    }
}
