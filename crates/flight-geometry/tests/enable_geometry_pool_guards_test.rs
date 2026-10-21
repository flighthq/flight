use std::sync::Arc;

use flight_geometry::*;

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
