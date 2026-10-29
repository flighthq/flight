//! flight-compiler: target-native
//! Fractional authored and call-site indices exist only in TypeScript. The paired TS test covers
//! those four cases; these native cases pin the same validation boundary for Rust's i32 domain.

use flight_entity::{FlightError, FlightErrorKind};
use flight_statechart::*;

fn chart() -> StatechartRaw {
    return StatechartRaw {
        inputs: Vec::new(),
        name: None,
        regions: vec![StatechartRegion {
            initial_state_index: 0,
            name: None,
            states: vec![
                StatechartState {
                    kind: StatechartAtomicStateKind.to_string(),
                    name: None,
                    transitions: vec![StatechartTransition {
                        conditions: Vec::new(),
                        duration_ms: 0.0,
                        exit_time_ratio: -1.0,
                        target_state_index: 1,
                    }],
                },
                StatechartState {
                    kind: StatechartAtomicStateKind.to_string(),
                    name: None,
                    transitions: Vec::new(),
                },
            ],
        }],
    };
}

fn assert_range_error(run: impl FnOnce()) {
    let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(run)).unwrap_err();
    let error = error.downcast_ref::<FlightError>().unwrap();
    assert_eq!(error.kind, FlightErrorKind::RangeError);
}

mod integer_domain {
    use super::*;

    #[test]
    fn rejects_invalid_authored_indices_before_initializing_an_instance() {
        let mut invalid_initial = chart();
        invalid_initial.regions[0].initial_state_index = -1;
        assert_range_error(|| {
            crate::create_instance(&invalid_initial);
        });

        let mut invalid_target = chart();
        invalid_target.regions[0].states[0].transitions[0].target_state_index = -1;
        assert_range_error(|| {
            crate::create_instance(&invalid_target);
        });
    }

    #[test]
    fn region_getters_return_the_sentinel_for_indices_outside_the_i32_domain() {
        let instance = crate::create_instance(&chart());
        assert_eq!(get_statechart_region_blend(&instance, -1), -1.0);
        assert_eq!(get_statechart_region_state(&instance, -1), -1);
        assert_eq!(get_statechart_region_blend(&instance, i32::MAX), -1.0);
        assert_eq!(get_statechart_region_state(&instance, i32::MAX), -1);
    }
}
