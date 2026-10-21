use std::sync::Arc;

use flight_bitmap::HostImageSource;
use flight_image::contract::*;

fn source() -> Arc<HostImageSource> {
    return Arc::new(HostImageSource {
        provider: Arc::new(()),
        handle: Arc::new(()),
    });
}

mod create_image_resolver_state {
    use super::*;

    #[test]
    fn creates_independent_empty_state() {
        let mut first = create_image_resolver_state();
        let second = create_image_resolver_state();
        register_host_image_dimension_resolver(&mut first, Arc::new(|_, _| true));
        assert!(has_host_image_dimension_resolver(&first));
        assert!(!has_host_image_dimension_resolver(&second));
    }
}

mod get_host_image_source_dimensions {
    use super::*;

    #[test]
    fn leaves_out_untouched_without_a_registered_resolver() {
        let state = create_image_resolver_state();
        let mut out = HostImageDimensions {
            height: 11,
            width: 22,
        };
        assert!(!get_host_image_source_dimensions(
            &mut out,
            &source(),
            &state
        ));
        assert_eq!(
            out,
            HostImageDimensions {
                height: 11,
                width: 22
            }
        );
    }

    #[test]
    fn measures_the_exact_source_identity_through_the_current_resolver() {
        let expected = source();
        let captured = expected.clone();
        let mut state = create_image_resolver_state();
        register_host_image_dimension_resolver(
            &mut state,
            Arc::new(move |actual, out| {
                if !Arc::ptr_eq(actual, &captured) {
                    return false;
                }
                out.height = 4;
                out.width = 8;
                return true;
            }),
        );
        let mut out = HostImageDimensions {
            height: 0,
            width: 0,
        };
        assert!(get_host_image_source_dimensions(
            &mut out, &expected, &state
        ));
        assert_eq!(
            out,
            HostImageDimensions {
                height: 4,
                width: 8
            }
        );
    }
}

mod has_host_image_dimension_resolver {
    use super::*;

    #[test]
    fn follows_registration_and_unregistration() {
        let mut state = create_image_resolver_state();
        assert!(!has_host_image_dimension_resolver(&state));
        register_host_image_dimension_resolver(&mut state, Arc::new(|_, _| false));
        assert!(has_host_image_dimension_resolver(&state));
        unregister_host_image_dimension_resolver(&mut state);
        assert!(!has_host_image_dimension_resolver(&state));
    }
}

mod register_host_image_dimension_resolver {
    use super::*;

    #[test]
    fn the_last_registration_wins() {
        let mut state = create_image_resolver_state();
        register_host_image_dimension_resolver(
            &mut state,
            Arc::new(|_, out| {
                out.width = 1;
                return true;
            }),
        );
        register_host_image_dimension_resolver(
            &mut state,
            Arc::new(|_, out| {
                out.width = 3;
                return true;
            }),
        );
        let mut out = HostImageDimensions {
            height: 0,
            width: 0,
        };
        assert!(get_host_image_source_dimensions(
            &mut out,
            &source(),
            &state
        ));
        assert_eq!(out.width, 3);
    }
}

mod unregister_host_image_dimension_resolver {
    use super::*;

    #[test]
    fn clears_only_the_caller_owned_state() {
        let resolver: HostImageDimensionResolver = Arc::new(|_, _| true);
        let mut first = create_image_resolver_state();
        let mut second = create_image_resolver_state();
        register_host_image_dimension_resolver(&mut first, resolver.clone());
        register_host_image_dimension_resolver(&mut second, resolver);
        unregister_host_image_dimension_resolver(&mut first);
        assert!(!has_host_image_dimension_resolver(&first));
        assert!(has_host_image_dimension_resolver(&second));
    }
}
