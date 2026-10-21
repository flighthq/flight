use std::sync::Arc;

use flight_node::contract::*;

mod default_compute_local_bounds_rectangle {
    use super::*;

    #[test]
    fn is_a_no_op_that_does_not_modify_out() {
        let mut out = flight_geometry::create_rectangle(1.0, 2.0, 3.0, 4.0);
        let node = crate::support::create_test_node("Test");
        let guard = node.read().unwrap();
        default_compute_local_bounds_rectangle(&mut out, &*guard);
        assert_eq!((out.x, out.y, out.width, out.height), (1.0, 2.0, 3.0, 4.0));
    }
}

mod init_bounds_rectangle_runtime_trait {
    use super::*;

    fn empty_runtime() -> HasBoundsRectangleRuntime {
        return HasBoundsRectangleRuntime {
            bounds_rectangle: Some(flight_geometry::create_rectangle(1.0, 2.0, 3.0, 4.0)),
            compute_local_bounds_rectangle: Arc::new(
                |_out: &mut flight_geometry::Rectangle, _source: &dyn Node| {},
            ),
            is_local_bounds_rectangle_valid: Some(Arc::new(|_source: &dyn Node| true)),
            local_bounds_rectangle: Some(flight_geometry::create_rectangle(1.0, 2.0, 3.0, 4.0)),
            world_bounds_rectangle: Some(flight_geometry::create_rectangle(1.0, 2.0, 3.0, 4.0)),
        };
    }

    #[test]
    fn initializes_default_values() {
        let mut runtime = empty_runtime();
        init_bounds_rectangle_runtime_trait(&mut runtime, None);
        assert_eq!(runtime.bounds_rectangle, None);
        assert_eq!(runtime.local_bounds_rectangle, None);
        assert_eq!(runtime.world_bounds_rectangle, None);
        assert!(runtime.is_local_bounds_rectangle_valid.is_none());
    }

    #[test]
    fn installs_a_kind_owned_local_bounds_validity_hook() {
        let mut runtime = empty_runtime();
        let methods = BoundsRectangleRuntimeMethods {
            compute_local_bounds_rectangle: None,
            is_local_bounds_rectangle_valid: Some(Arc::new(|_source: &dyn Node| true)),
        };
        init_bounds_rectangle_runtime_trait(&mut runtime, Some(&methods));
        let node = crate::support::create_test_node("Test");
        let guard = node.read().unwrap();
        assert!((runtime.is_local_bounds_rectangle_valid.as_ref().unwrap())(
            &*guard
        ));
    }
}

mod init_bounds_rectangle_trait {
    use super::*;

    #[test]
    fn does_nothing_and_allows_an_empty_options_record() {
        let mut target = HasBoundsRectangle {};
        init_bounds_rectangle_trait(&mut target, None);
        init_bounds_rectangle_trait(&mut target, Some(&HasBoundsRectangleOptions {}));
    }
}
