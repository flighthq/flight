//! D18 Rust conveniences for the permissions public lane. Methods contain no behavior: capability
//! methods and enum string helpers delegate to the corresponding free functions.

use flight_geolocation::HostGeolocationCapability;

use crate::permission::*;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::Arc;

    use flight_notification::HostNotificationPermissionCapability;
    use flight_notification::NotificationLifecycleReason;
    use flight_notification::NotificationPermission;
    use flight_notification::NotificationPermissionQueryOutcome;
    use flight_notification::NotificationPermissionRequestOutcome;
    use flight_notification::NotificationPermissionRequestReason;

    use super::*;
    use crate::test_support::block_on;

    fn capability() -> HostPermissionsCapability {
        return HostPermissionsCapability {
            notification: HostNotificationPermissionCapability {
                get_permission: Arc::new(|| {
                    return Box::pin(async {
                        NotificationPermissionQueryOutcome {
                            reason: NotificationLifecycleReason::Ok,
                            permission: Some(NotificationPermission::Default),
                        }
                    });
                }),
                request_permission: Arc::new(|| {
                    return Box::pin(async {
                        NotificationPermissionRequestOutcome {
                            reason: NotificationPermissionRequestReason::Dismissed,
                        }
                    });
                }),
                provider: Arc::new(()),
            },
            provider: Arc::new(()),
            query_permission: Arc::new(|_name| {
                return Box::pin(async {
                    Ok(PermissionQueryOutcome {
                        reason: PermissionQueryReason::Unsupported,
                        state: None,
                    })
                });
            }),
            request_media_access: Arc::new(|_name| {
                return Box::pin(async {
                    Ok(PermissionRequestOutcome {
                        reason: PermissionRequestReason::RuntimeUnavailable,
                        state: None,
                    })
                });
            }),
            request_wake_lock: Arc::new(|| {
                return Box::pin(async {
                    Ok(PermissionRequestOutcome {
                        reason: PermissionRequestReason::RuntimeUnavailable,
                        state: None,
                    })
                });
            }),
        };
    }

    #[test]
    fn get_permission_state_method_matches_free_function() {
        let method_capability = capability();
        let free_capability = capability();
        assert_eq!(
            block_on(method_capability.get_permission_state(None, None, "notifications")),
            block_on(get_permission_state(
                &free_capability,
                None,
                None,
                "notifications",
            ))
        );
    }

    #[test]
    fn get_permission_states_method_matches_free_function() {
        let method_capability = capability();
        let free_capability = capability();
        let names = ["notifications".to_string(), "camera".to_string()];
        assert_eq!(
            block_on(method_capability.get_permission_states(None, None, &names)),
            block_on(get_permission_states(&free_capability, None, None, &names,))
        );
    }

    #[test]
    fn permission_query_failure_reason_parse_delegates() {
        assert_eq!(
            PermissionQueryFailureReason::parse("operation-failed"),
            parse_permission_query_failure_reason("operation-failed")
        );
    }

    #[test]
    fn permission_query_failure_reason_to_string_delegates() {
        assert_eq!(
            PermissionQueryFailureReason::Unsupported.to_str(),
            get_permission_query_failure_reason_string(PermissionQueryFailureReason::Unsupported)
        );
    }

    #[test]
    fn permission_query_reason_parse_delegates() {
        assert_eq!(
            PermissionQueryReason::parse("best-effort"),
            parse_permission_query_reason("best-effort")
        );
    }

    #[test]
    fn permission_query_reason_to_string_delegates() {
        assert_eq!(
            PermissionQueryReason::Ok.to_str(),
            get_permission_query_reason_string(PermissionQueryReason::Ok)
        );
    }

    #[test]
    fn permission_request_failure_reason_parse_delegates() {
        assert_eq!(
            PermissionRequestFailureReason::parse("no-request-route"),
            parse_permission_request_failure_reason("no-request-route")
        );
    }

    #[test]
    fn permission_request_failure_reason_to_string_delegates() {
        assert_eq!(
            PermissionRequestFailureReason::Timeout.to_str(),
            get_permission_request_failure_reason_string(PermissionRequestFailureReason::Timeout)
        );
    }

    #[test]
    fn permission_request_reason_parse_delegates() {
        assert_eq!(
            PermissionRequestReason::parse("cleanup-failed"),
            parse_permission_request_reason("cleanup-failed")
        );
    }

    #[test]
    fn permission_request_reason_to_string_delegates() {
        assert_eq!(
            PermissionRequestReason::Granted.to_str(),
            get_permission_request_reason_string(PermissionRequestReason::Granted)
        );
    }

    #[test]
    fn permission_state_parse_delegates() {
        assert_eq!(
            PermissionState::parse("prompt"),
            parse_permission_state("prompt")
        );
    }

    #[test]
    fn permission_state_to_string_delegates() {
        assert_eq!(
            PermissionState::Denied.to_str(),
            get_permission_state_string(PermissionState::Denied)
        );
    }

    #[test]
    fn request_permission_method_matches_free_function() {
        let method_capability = capability();
        let free_capability = capability();
        assert_eq!(
            block_on(method_capability.request_permission(None, None, "midi")),
            block_on(request_permission(&free_capability, None, None, "midi",))
        );
    }

    #[test]
    fn storage_persistence_outcome_reason_parse_delegates() {
        assert_eq!(
            StoragePersistenceOutcomeReason::parse("persistent"),
            parse_storage_persistence_outcome_reason("persistent")
        );
    }

    #[test]
    fn storage_persistence_outcome_reason_to_string_delegates() {
        assert_eq!(
            StoragePersistenceOutcomeReason::BestEffort.to_str(),
            get_storage_persistence_outcome_reason_string(
                StoragePersistenceOutcomeReason::BestEffort,
            )
        );
    }
}

impl HostPermissionsCapability {
    pub async fn get_permission_state(
        &self,
        host_midi_permission: Option<&HostMidiPermissionCapability>,
        host_preferences_persistence_query: Option<&HostPreferencesPersistenceQueryCapability>,
        name: &str,
    ) -> PermissionQueryOutcome {
        return get_permission_state(
            self,
            host_midi_permission,
            host_preferences_persistence_query,
            name,
        )
        .await;
    }

    pub async fn get_permission_states(
        &self,
        host_midi_permission: Option<&HostMidiPermissionCapability>,
        host_preferences_persistence_query: Option<&HostPreferencesPersistenceQueryCapability>,
        names: &[PermissionName],
    ) -> Vec<PermissionQueryOutcome> {
        return get_permission_states(
            self,
            host_midi_permission,
            host_preferences_persistence_query,
            names,
        )
        .await;
    }

    pub async fn request_permission(
        &self,
        host_preferences_persistence_request: Option<&HostPreferencesPersistenceRequestCapability>,
        host_geolocation: Option<&HostGeolocationCapability>,
        name: &str,
    ) -> PermissionRequestOutcome {
        return request_permission(
            self,
            host_preferences_persistence_request,
            host_geolocation,
            name,
        )
        .await;
    }
}

impl PermissionQueryFailureReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_permission_query_failure_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_permission_query_failure_reason_string(self);
    }
}

impl PermissionQueryReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_permission_query_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_permission_query_reason_string(self);
    }
}

impl PermissionRequestFailureReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_permission_request_failure_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_permission_request_failure_reason_string(self);
    }
}

impl PermissionRequestReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_permission_request_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_permission_request_reason_string(self);
    }
}

impl PermissionState {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_permission_state(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_permission_state_string(self);
    }
}

impl StoragePersistenceOutcomeReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_storage_persistence_outcome_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_storage_persistence_outcome_reason_string(self);
    }
}
