use std::sync::Arc;

use flight_entity::{FlightError, FlightErrorKind};
use flight_geolocation::*;

use crate::block_on;

fn prompt_capability(
    prompt_for_access: Option<Arc<dyn Fn() -> GeolocationPromptFuture + Send + Sync>>,
) -> HostGeolocationCapability {
    return HostGeolocationCapability {
        clear_watch: Arc::new(|_id: i32| {}),
        get_current_position: Arc::new(|_options: GeolocationRequestOptions| {
            let future: GeolocationPositionFuture = Box::pin(async { None });
            return future;
        }),
        get_current_position_result: Arc::new(|_options: GeolocationRequestOptions| {
            let future: GeolocationPositionResultFuture = Box::pin(async {
                GeolocationPositionResult {
                    position: None,
                    reason: None,
                }
            });
            return future;
        }),
        is_available: Arc::new(|| false),
        watch_position: Arc::new(
            |_handler: Arc<dyn Fn(&GeolocationPosition) + Send + Sync>,
             _options: GeolocationRequestOptions,
             _on_error: Option<Arc<dyn Fn(GeolocationErrorReason) + Send + Sync>>| {
                return 0;
            },
        ),
        prompt_for_access,
    };
}

fn provider_answering(outcome: GeolocationAccessOutcome) -> HostGeolocationCapability {
    return prompt_capability(Some(Arc::new(move || {
        let outcome = outcome.clone();
        let future: GeolocationPromptFuture = Box::pin(async move { Ok(outcome) });
        return future;
    })));
}

mod prompt_for_geolocation_access {
    use super::*;

    #[test]
    fn reports_granted_when_the_host_grants_access() {
        let host = provider_answering(GeolocationAccessOutcome {
            reason: GeolocationAccessReason::Granted,
        });
        let outcome = block_on(flight_geolocation::prompt_for_geolocation_access(Some(
            &host,
        )));
        assert_eq!(
            outcome,
            GeolocationAccessOutcome {
                reason: GeolocationAccessReason::Granted,
            }
        );
    }

    #[test]
    fn keeps_denied_dismissed_and_timeout_as_three_distinct_outcomes() {
        let reasons = [
            GeolocationAccessReason::Denied,
            GeolocationAccessReason::Dismissed,
            GeolocationAccessReason::Timeout,
        ];
        let mut seen = Vec::new();
        for reason in reasons {
            let host = provider_answering(GeolocationAccessOutcome { reason });
            seen.push(
                block_on(flight_geolocation::prompt_for_geolocation_access(Some(
                    &host,
                )))
                .reason,
            );
        }
        assert_eq!(seen, reasons);
        assert_eq!(seen[0] == seen[1], false);
        assert_eq!(seen[1] == seen[2], false);
        assert_eq!(seen[0] == seen[2], false);
    }

    #[test]
    fn reports_runtime_unavailable_when_no_provider_is_installed() {
        let outcome = block_on(flight_geolocation::prompt_for_geolocation_access(None));
        assert_eq!(
            outcome,
            GeolocationAccessOutcome {
                reason: GeolocationAccessReason::RuntimeUnavailable,
            }
        );
    }

    #[test]
    fn reports_runtime_unavailable_when_the_provider_has_no_prompt() {
        let host = prompt_capability(None);
        let outcome = block_on(flight_geolocation::prompt_for_geolocation_access(Some(
            &host,
        )));
        assert_eq!(
            outcome,
            GeolocationAccessOutcome {
                reason: GeolocationAccessReason::RuntimeUnavailable,
            }
        );
    }

    #[test]
    fn reports_operation_failed_when_the_provider_rejects() {
        let host = prompt_capability(Some(Arc::new(|| {
            let future: GeolocationPromptFuture = Box::pin(async {
                Err(FlightError {
                    kind: FlightErrorKind::Error,
                    message: "boom".to_string(),
                })
            });
            return future;
        })));
        let outcome = block_on(flight_geolocation::prompt_for_geolocation_access(Some(
            &host,
        )));
        assert_eq!(
            outcome,
            GeolocationAccessOutcome {
                reason: GeolocationAccessReason::OperationFailed,
            }
        );
    }
}
