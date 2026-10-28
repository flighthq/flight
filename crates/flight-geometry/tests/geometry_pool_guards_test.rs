use std::sync::Arc;

use flight_geometry::contract::*;

mod set_geometry_pool_release_guard {
    use super::*;

    #[test]
    fn installs_replaces_and_removes_the_release_callback() {
        let first: GeometryPoolReleaseGuard = Arc::new(|_| {});
        let second: GeometryPoolReleaseGuard = Arc::new(|_| {});
        assert_eq!(Arc::strong_count(&first), 1);
        assert_eq!(Arc::strong_count(&second), 1);

        set_geometry_pool_release_guard(Some(first.clone()));
        assert!(are_geometry_pool_guards_enabled());
        assert_eq!(Arc::strong_count(&first), 2);

        set_geometry_pool_release_guard(Some(second.clone()));
        assert!(are_geometry_pool_guards_enabled());
        assert_eq!(Arc::strong_count(&first), 1);
        assert_eq!(Arc::strong_count(&second), 2);

        set_geometry_pool_release_guard(None);
        assert!(!are_geometry_pool_guards_enabled());
        assert_eq!(Arc::strong_count(&second), 1);
    }
}
