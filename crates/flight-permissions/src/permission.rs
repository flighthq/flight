use std::future::Future;
use std::pin::Pin;
use std::task::Poll;

use flight_geolocation::GeolocationAccessReason;
use flight_geolocation::HostGeolocationCapability;
use flight_notification::HostNotificationPermissionCapability;
use flight_notification::NotificationLifecycleReason;
use flight_notification::NotificationPermission;
use flight_notification::NotificationPermissionRequestReason;

use crate::types::*;

#[derive(Clone)]
struct PermissionQueryOrigins {
    midi: Option<HostMidiPermissionCapability>,
    notification: Option<HostNotificationPermissionCapability>,
    permissions: Option<HostPermissionsCapability>,
    persistence: Option<HostPreferencesPersistenceQueryCapability>,
}

fn capture_permission_query_origins(
    host_permissions: &HostPermissionsCapability,
    host_midi_permission: Option<&HostMidiPermissionCapability>,
    host_preferences_persistence_query: Option<&HostPreferencesPersistenceQueryCapability>,
    names: &[PermissionName],
) -> PermissionQueryOrigins {
    let needs_notification = names.iter().any(|name| name == "notifications");
    let needs_midi = names.iter().any(|name| name == "midi");
    let needs_persistence = names.iter().any(|name| name == "persistent-storage");
    let needs_permissions = names
        .iter()
        .any(|name| name != "midi" && name != "notifications" && name != "persistent-storage");
    return PermissionQueryOrigins {
        midi: if needs_midi {
            host_midi_permission.cloned()
        } else {
            None
        },
        notification: if needs_notification {
            Some(host_permissions.notification.clone())
        } else {
            None
        },
        permissions: if needs_permissions {
            Some(host_permissions.clone())
        } else {
            None
        },
        persistence: if needs_persistence {
            host_preferences_persistence_query.cloned()
        } else {
            None
        },
    };
}

/// Reads one permission without escalating to a request that may prompt (TS
/// `getPermissionState`). The needed owner is captured before its asynchronous work starts.
pub async fn get_permission_state(
    host_permissions: &HostPermissionsCapability,
    host_midi_permission: Option<&HostMidiPermissionCapability>,
    host_preferences_persistence_query: Option<&HostPreferencesPersistenceQueryCapability>,
    name: &str,
) -> PermissionQueryOutcome {
    let names = [name.to_string()];
    let origins = capture_permission_query_origins(
        host_permissions,
        host_midi_permission,
        host_preferences_persistence_query,
        &names,
    );
    return query_permission_state(&origins, name).await;
}

/// Captures every owner before work starts, starts every query together, and returns results in
/// input order without coalescing repeated names (TS `getPermissionStates`).
pub async fn get_permission_states(
    host_permissions: &HostPermissionsCapability,
    host_midi_permission: Option<&HostMidiPermissionCapability>,
    host_preferences_persistence_query: Option<&HostPreferencesPersistenceQueryCapability>,
    names: &[PermissionName],
) -> Vec<PermissionQueryOutcome> {
    if names.is_empty() {
        return Vec::new();
    }
    let origins = capture_permission_query_origins(
        host_permissions,
        host_midi_permission,
        host_preferences_persistence_query,
        names,
    );
    let mut futures: Vec<Pin<Box<dyn Future<Output = PermissionQueryOutcome> + Send>>> = Vec::new();
    for name in names {
        let captured_origins = origins.clone();
        let captured_name = name.clone();
        futures.push(Box::pin(async move {
            return query_permission_state(&captured_origins, &captured_name).await;
        }));
    }
    return join_permission_queries(futures).await;
}

async fn join_permission_queries(
    mut futures: Vec<Pin<Box<dyn Future<Output = PermissionQueryOutcome> + Send>>>,
) -> Vec<PermissionQueryOutcome> {
    let mut outcomes: Vec<Option<PermissionQueryOutcome>> = vec![None; futures.len()];
    std::future::poll_fn(|context| {
        let mut pending = false;
        for index in 0..futures.len() {
            if outcomes[index].is_some() {
                continue;
            }
            match futures[index].as_mut().poll(context) {
                Poll::Ready(outcome) => outcomes[index] = Some(outcome),
                Poll::Pending => pending = true,
            }
        }
        if pending {
            return Poll::Pending;
        }
        return Poll::Ready(());
    })
    .await;
    return outcomes
        .into_iter()
        .map(|outcome| outcome.expect("joined permission query outcome"))
        .collect();
}

fn project_storage_persistence_query(result: &StoragePersistenceOutcome) -> PermissionQueryOutcome {
    return match result.outcome {
        StoragePersistenceOutcomeReason::Persistent => PermissionQueryOutcome {
            reason: PermissionQueryReason::Ok,
            state: Some(PermissionState::Granted),
        },
        StoragePersistenceOutcomeReason::BestEffort => PermissionQueryOutcome {
            reason: PermissionQueryReason::BestEffort,
            state: result.permission_state,
        },
        StoragePersistenceOutcomeReason::OperationFailed => PermissionQueryOutcome {
            reason: PermissionQueryReason::OperationFailed,
            state: None,
        },
    };
}

fn project_storage_persistence_request(
    result: &StoragePersistenceOutcome,
) -> PermissionRequestOutcome {
    return match result.outcome {
        StoragePersistenceOutcomeReason::Persistent => PermissionRequestOutcome {
            reason: PermissionRequestReason::Granted,
            state: Some(PermissionState::Granted),
        },
        StoragePersistenceOutcomeReason::BestEffort => PermissionRequestOutcome {
            reason: PermissionRequestReason::BestEffort,
            state: result.permission_state,
        },
        StoragePersistenceOutcomeReason::OperationFailed => PermissionRequestOutcome {
            reason: PermissionRequestReason::OperationFailed,
            state: None,
        },
    };
}

async fn query_midi_permission(
    capability: Option<&HostMidiPermissionCapability>,
) -> PermissionQueryOutcome {
    let Some(capability) = capability else {
        return PermissionQueryOutcome {
            reason: PermissionQueryReason::Unsupported,
            state: None,
        };
    };
    return match (capability.get_permission)().await {
        Ok(outcome) => outcome,
        Err(_) => PermissionQueryOutcome {
            reason: PermissionQueryReason::OperationFailed,
            state: None,
        },
    };
}

async fn query_notification_permission(
    capability: Option<&HostNotificationPermissionCapability>,
) -> PermissionQueryOutcome {
    let Some(capability) = capability else {
        return PermissionQueryOutcome {
            reason: PermissionQueryReason::Unsupported,
            state: None,
        };
    };
    let outcome = (capability.get_permission)().await;
    if outcome.reason != NotificationLifecycleReason::Ok {
        return PermissionQueryOutcome {
            reason: PermissionQueryReason::OperationFailed,
            state: None,
        };
    }
    let state = match outcome.permission {
        Some(NotificationPermission::Default) => PermissionState::Prompt,
        Some(NotificationPermission::Denied) => PermissionState::Denied,
        Some(NotificationPermission::Granted) => PermissionState::Granted,
        None => {
            return PermissionQueryOutcome {
                reason: PermissionQueryReason::OperationFailed,
                state: None,
            };
        }
    };
    return PermissionQueryOutcome {
        reason: PermissionQueryReason::Ok,
        state: Some(state),
    };
}

async fn query_permission_state(
    origins: &PermissionQueryOrigins,
    name: &str,
) -> PermissionQueryOutcome {
    if name == "notifications" {
        return query_notification_permission(origins.notification.as_ref()).await;
    }
    if name == "midi" {
        return query_midi_permission(origins.midi.as_ref()).await;
    }
    if name == "persistent-storage" {
        return query_storage_persistence_permission(origins.persistence.as_ref()).await;
    }
    let Some(capability) = origins.permissions.as_ref() else {
        return PermissionQueryOutcome {
            reason: PermissionQueryReason::RuntimeUnavailable,
            state: None,
        };
    };
    return match (capability.query_permission)(name.to_string()).await {
        Ok(outcome) => outcome,
        Err(_) => PermissionQueryOutcome {
            reason: PermissionQueryReason::OperationFailed,
            state: None,
        },
    };
}

async fn query_storage_persistence_permission(
    capability: Option<&HostPreferencesPersistenceQueryCapability>,
) -> PermissionQueryOutcome {
    let Some(capability) = capability else {
        return PermissionQueryOutcome {
            reason: PermissionQueryReason::Unsupported,
            state: None,
        };
    };
    return match (capability.get_persistence)().await {
        Ok(outcome) => project_storage_persistence_query(&outcome),
        Err(_) => PermissionQueryOutcome {
            reason: PermissionQueryReason::OperationFailed,
            state: None,
        },
    };
}

async fn request_geolocation_access_permission(
    host_geolocation: Option<&HostGeolocationCapability>,
) -> PermissionRequestOutcome {
    let Some(prompt_for_access) =
        host_geolocation.and_then(|capability| capability.prompt_for_access.as_ref())
    else {
        return PermissionRequestOutcome {
            reason: PermissionRequestReason::RuntimeUnavailable,
            state: None,
        };
    };
    let outcome = match prompt_for_access().await {
        Ok(outcome) => outcome,
        Err(_) => {
            return PermissionRequestOutcome {
                reason: PermissionRequestReason::OperationFailed,
                state: None,
            };
        }
    };
    return match outcome.reason {
        GeolocationAccessReason::Granted => PermissionRequestOutcome {
            reason: PermissionRequestReason::Granted,
            state: Some(PermissionState::Granted),
        },
        GeolocationAccessReason::Denied => PermissionRequestOutcome {
            reason: PermissionRequestReason::Denied,
            state: Some(PermissionState::Denied),
        },
        GeolocationAccessReason::Dismissed => PermissionRequestOutcome {
            reason: PermissionRequestReason::Dismissed,
            state: Some(PermissionState::Prompt),
        },
        GeolocationAccessReason::CleanupFailed => PermissionRequestOutcome {
            reason: PermissionRequestReason::CleanupFailed,
            state: Some(PermissionState::Granted),
        },
        GeolocationAccessReason::OperationFailed => PermissionRequestOutcome {
            reason: PermissionRequestReason::OperationFailed,
            state: None,
        },
        GeolocationAccessReason::RuntimeUnavailable => PermissionRequestOutcome {
            reason: PermissionRequestReason::RuntimeUnavailable,
            state: None,
        },
        GeolocationAccessReason::Timeout => PermissionRequestOutcome {
            reason: PermissionRequestReason::Timeout,
            state: None,
        },
    };
}

async fn request_host_media_access(
    host_permissions: &HostPermissionsCapability,
    name: &str,
) -> PermissionRequestOutcome {
    return match (host_permissions.request_media_access)(name.to_string()).await {
        Ok(outcome) => outcome,
        Err(_) => PermissionRequestOutcome {
            reason: PermissionRequestReason::OperationFailed,
            state: None,
        },
    };
}

async fn request_host_wake_lock(
    host_permissions: &HostPermissionsCapability,
) -> PermissionRequestOutcome {
    return match (host_permissions.request_wake_lock)().await {
        Ok(outcome) => outcome,
        Err(_) => PermissionRequestOutcome {
            reason: PermissionRequestReason::OperationFailed,
            state: None,
        },
    };
}

async fn request_notification_permission(
    capability: Option<&HostNotificationPermissionCapability>,
) -> PermissionRequestOutcome {
    let Some(capability) = capability else {
        return PermissionRequestOutcome {
            reason: PermissionRequestReason::Unsupported,
            state: None,
        };
    };
    return match (capability.request_permission)().await.reason {
        NotificationPermissionRequestReason::Granted => PermissionRequestOutcome {
            reason: PermissionRequestReason::Granted,
            state: Some(PermissionState::Granted),
        },
        NotificationPermissionRequestReason::Denied => PermissionRequestOutcome {
            reason: PermissionRequestReason::Denied,
            state: Some(PermissionState::Denied),
        },
        NotificationPermissionRequestReason::Dismissed => PermissionRequestOutcome {
            reason: PermissionRequestReason::Dismissed,
            state: Some(PermissionState::Prompt),
        },
        NotificationPermissionRequestReason::OperationFailed => PermissionRequestOutcome {
            reason: PermissionRequestReason::OperationFailed,
            state: None,
        },
    };
}

/// Requests one permission through only the method-tight owner selected by its name (TS
/// `requestPermission`). A missing request route never degrades to a read.
pub async fn request_permission(
    host_permissions: &HostPermissionsCapability,
    host_preferences_persistence_request: Option<&HostPreferencesPersistenceRequestCapability>,
    host_geolocation: Option<&HostGeolocationCapability>,
    name: &str,
) -> PermissionRequestOutcome {
    if name == "notifications" {
        return request_notification_permission(Some(&host_permissions.notification)).await;
    }
    if name == "persistent-storage" {
        return request_storage_persistence_permission(host_preferences_persistence_request).await;
    }
    if name == "geolocation" {
        return request_geolocation_access_permission(host_geolocation).await;
    }
    if name == "midi" {
        return PermissionRequestOutcome {
            reason: PermissionRequestReason::NoRequestRoute,
            state: None,
        };
    }
    return match name {
        "camera" | "microphone" => request_host_media_access(host_permissions, name).await,
        "screen-wake-lock" => request_host_wake_lock(host_permissions).await,
        "clipboard-read" | "clipboard-write" | "push" => PermissionRequestOutcome {
            reason: PermissionRequestReason::NoRequestRoute,
            state: None,
        },
        _ => PermissionRequestOutcome {
            reason: PermissionRequestReason::Unsupported,
            state: None,
        },
    };
}

async fn request_storage_persistence_permission(
    capability: Option<&HostPreferencesPersistenceRequestCapability>,
) -> PermissionRequestOutcome {
    let Some(capability) = capability else {
        return PermissionRequestOutcome {
            reason: PermissionRequestReason::Unsupported,
            state: None,
        };
    };
    return match (capability.request_persistence)().await {
        Ok(outcome) => project_storage_persistence_request(&outcome),
        Err(_) => PermissionRequestOutcome {
            reason: PermissionRequestReason::OperationFailed,
            state: None,
        },
    };
}
