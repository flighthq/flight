use std::sync::Arc;
use std::sync::RwLock;

use flight_geometry::*;
use flight_log::create_log_state;

mod are_geometry_pool_guards_enabled {
    use super::*;

    #[test]
    fn reports_whether_the_release_callback_is_installed() {
        set_geometry_pool_release_guard(None);
        assert!(!are_geometry_pool_guards_enabled());
        set_geometry_pool_release_guard(Some(Arc::new(|_| {})));
        assert!(are_geometry_pool_guards_enabled());
        disable_geometry_pool_guards();
    }

    #[test]
    fn uses_thread_local_guard_state() {
        set_geometry_pool_release_guard(Some(Arc::new(|_| {})));
        assert!(are_geometry_pool_guards_enabled());
        std::thread::spawn(|| assert!(!are_geometry_pool_guards_enabled()))
            .join()
            .unwrap();
        assert!(are_geometry_pool_guards_enabled());
        disable_geometry_pool_guards();
    }
}

mod disable_geometry_pool_guards {
    use super::*;

    #[test]
    fn restores_the_production_default_release_path() {
        set_geometry_pool_release_guard(Some(Arc::new(|_| {})));
        disable_geometry_pool_guards();
        assert!(!are_geometry_pool_guards_enabled());
    }
}

mod enable_geometry_pool_guards {
    use super::*;

    #[test]
    fn installs_a_guard_that_retains_caller_owned_dependencies_until_disabled() {
        disable_geometry_pool_guards();
        let log_state = Arc::new(RwLock::new(create_log_state()));
        let clock: Arc<dyn Fn() -> f64 + Send + Sync> = Arc::new(|| return 1234.0);
        assert_eq!(Arc::strong_count(&log_state), 1);
        assert_eq!(Arc::strong_count(&clock), 1);

        enable_geometry_pool_guards(&log_state, clock.clone());
        assert!(are_geometry_pool_guards_enabled());
        assert_eq!(Arc::strong_count(&log_state), 2);
        assert_eq!(Arc::strong_count(&clock), 2);

        disable_geometry_pool_guards();
        assert!(!are_geometry_pool_guards_enabled());
        assert_eq!(Arc::strong_count(&log_state), 1);
        assert_eq!(Arc::strong_count(&clock), 1);
    }

    #[test]
    fn replaces_an_existing_callback_and_none_remains_a_valid_disabled_state() {
        let previous: GeometryPoolReleaseGuard = Arc::new(|_| {});
        set_geometry_pool_release_guard(Some(previous.clone()));
        assert_eq!(Arc::strong_count(&previous), 2);

        let log_state = Arc::new(RwLock::new(create_log_state()));
        enable_geometry_pool_guards(&log_state, Arc::new(|| return 1234.0));
        assert!(are_geometry_pool_guards_enabled());
        assert_eq!(Arc::strong_count(&previous), 1);

        set_geometry_pool_release_guard(None);
        assert!(!are_geometry_pool_guards_enabled());
    }
}
