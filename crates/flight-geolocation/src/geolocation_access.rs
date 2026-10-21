use crate::types::*;

/// Raises the platform's own location-access prompt through the host provider (TS
/// `promptForGeolocationAccess`). An absent provider is an expected `runtime-unavailable`
/// outcome; a rejected prompt is reported as `operation-failed`, matching the source's catch.
pub async fn prompt_for_geolocation_access(
    host_geolocation: Option<&HostGeolocationCapability>,
) -> GeolocationAccessOutcome {
    let Some(host) = host_geolocation else {
        return GeolocationAccessOutcome {
            reason: GeolocationAccessReason::RuntimeUnavailable,
        };
    };
    let Some(prompt_for_access) = host.prompt_for_access.as_ref() else {
        return GeolocationAccessOutcome {
            reason: GeolocationAccessReason::RuntimeUnavailable,
        };
    };
    return match prompt_for_access().await {
        Ok(outcome) => outcome,
        Err(_) => GeolocationAccessOutcome {
            reason: GeolocationAccessReason::OperationFailed,
        },
    };
}
