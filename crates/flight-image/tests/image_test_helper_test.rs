use std::sync::Arc;

use flight_host::HostImageSource;
use flight_image::contract::*;

fn source(handle: Arc<dyn std::any::Any + Send + Sync>) -> Arc<HostImageSource> {
    return Arc::new(HostImageSource {
        provider: Arc::new(()),
        handle,
    });
}

mod register_test_image_dimension_resolver {
    use super::*;

    #[test]
    fn fills_the_caller_slot_so_a_portable_test_can_measure_a_sized_handle() {
        let mut state = create_image_resolver_state();
        register_test_image_dimension_resolver(&mut state);
        let mut out = HostImageDimensions {
            height: 0,
            width: 0,
        };
        let image = source(Arc::new(HostImageDimensions {
            height: 3,
            width: 9,
        }));

        assert!(has_host_image_dimension_resolver(&state));
        assert!(get_host_image_source_dimensions(&mut out, &image, &state));
        assert_eq!(
            out,
            HostImageDimensions {
                height: 3,
                width: 9
            }
        );
    }
}

mod test_image_dimension_resolver {
    use super::*;

    #[test]
    fn declines_an_unsized_handle_and_leaves_out_untouched() {
        let mut out = HostImageDimensions {
            height: 5,
            width: 7,
        };
        assert!(!test_image_dimension_resolver(
            &source(Arc::new(())),
            &mut out
        ));
        assert_eq!(
            out,
            HostImageDimensions {
                height: 5,
                width: 7
            }
        );
    }

    #[test]
    fn reads_width_and_height_from_a_sized_test_handle() {
        let mut out = HostImageDimensions {
            height: 0,
            width: 0,
        };
        assert!(test_image_dimension_resolver(
            &source(Arc::new(HostImageDimensions {
                height: 6,
                width: 12,
            })),
            &mut out
        ));
        assert_eq!(
            out,
            HostImageDimensions {
                height: 6,
                width: 12
            }
        );
    }
}

mod unregister_test_image_dimension_resolver {
    use super::*;

    #[test]
    fn empties_only_the_supplied_state() {
        let mut first = create_image_resolver_state();
        let mut second = create_image_resolver_state();
        register_test_image_dimension_resolver(&mut first);
        register_test_image_dimension_resolver(&mut second);
        unregister_test_image_dimension_resolver(&mut first);

        assert!(!has_host_image_dimension_resolver(&first));
        assert!(has_host_image_dimension_resolver(&second));
    }
}
