use std::sync::Arc;

use flight_entity::allocate_entity;

use crate::geolocation_access::prompt_for_geolocation_access;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use std::sync::{Arc, Mutex};

    fn backend(available: bool) -> HostGeolocationCapability {
        return HostGeolocationCapability {
            clear_watch: Arc::new(|_id: i32| {}),
            get_current_position: Arc::new(|_options: GeolocationRequestOptions| {
                let mut position = create_geolocation_position();
                position.latitude = 1.0;
                position.longitude = 2.0;
                let future: GeolocationPositionFuture = Box::pin(async move { Some(position) });
                return future;
            }),
            get_current_position_result: Arc::new(|_options: GeolocationRequestOptions| {
                let mut position = create_geolocation_position();
                position.latitude = 1.0;
                position.longitude = 2.0;
                let future: GeolocationPositionResultFuture = Box::pin(async move {
                    GeolocationPositionResult {
                        position: Some(position),
                        reason: None,
                    }
                });
                return future;
            }),
            is_available: Arc::new(move || available),
            watch_position: Arc::new(
                |listener: Arc<dyn Fn(&GeolocationPosition) + Send + Sync>,
                 _options: GeolocationRequestOptions,
                 _on_error: Option<Arc<dyn Fn(GeolocationErrorReason) + Send + Sync>>| {
                    let mut position = create_geolocation_position();
                    position.latitude = 3.0;
                    listener(&position);
                    return 1;
                },
            ),
            prompt_for_access: Some(Arc::new(|| {
                let future: GeolocationPromptFuture = Box::pin(async {
                    Ok(GeolocationAccessOutcome {
                        reason: GeolocationAccessReason::Granted,
                    })
                });
                return future;
            })),
        };
    }

    #[test]
    fn clear_watch_method_matches_clear_geolocation_watch() {
        let method_seen = Arc::new(Mutex::new(Vec::new()));
        let captured = method_seen.clone();
        let method_host = HostGeolocationCapability {
            clear_watch: Arc::new(move |id: i32| captured.lock().unwrap().push(id)),
            ..backend(true)
        };
        let free_seen = Arc::new(Mutex::new(Vec::new()));
        let captured = free_seen.clone();
        let free_host = HostGeolocationCapability {
            clear_watch: Arc::new(move |id: i32| captured.lock().unwrap().push(id)),
            ..backend(true)
        };
        method_host.clear_watch(7);
        clear_geolocation_watch(&free_host, 7);
        assert_eq!(*method_seen.lock().unwrap(), *free_seen.lock().unwrap());
    }

    #[test]
    fn get_current_position_method_matches_get_current_geolocation_position() {
        let method_host = backend(true);
        let free_host = backend(true);
        let via_method = block_on(method_host.get_current_position(None));
        let via_free = block_on(get_current_geolocation_position(&free_host, None));
        assert_eq!(via_method.unwrap().latitude, via_free.unwrap().latitude);
    }

    #[test]
    fn get_current_position_result_method_matches_get_current_geolocation_position_result() {
        let method_host = backend(true);
        let free_host = backend(true);
        let via_method = block_on(method_host.get_current_position_result(None));
        let via_free = block_on(get_current_geolocation_position_result(&free_host, None));
        assert_eq!(via_method.reason, via_free.reason);
        assert_eq!(
            via_method.position.unwrap().longitude,
            via_free.position.unwrap().longitude
        );
    }

    #[test]
    fn is_available_method_matches_is_geolocation_available() {
        let host = backend(true);
        assert_eq!(host.is_available(), is_geolocation_available(&host));
        let unavailable = backend(false);
        assert_eq!(
            unavailable.is_available(),
            is_geolocation_available(&unavailable)
        );
    }

    #[test]
    fn prompt_for_access_method_matches_prompt_for_geolocation_access() {
        let method_host = backend(true);
        let free_host = backend(true);
        let via_method = block_on(method_host.prompt_for_access());
        let via_free = block_on(prompt_for_geolocation_access(Some(&free_host)));
        assert_eq!(via_method, via_free);
    }

    #[test]
    fn watch_position_method_matches_watch_geolocation_position() {
        let method_seen = Arc::new(Mutex::new(0.0_f32));
        let captured = method_seen.clone();
        let method_host = backend(true);
        let method_id = method_host.watch_position(
            Arc::new(move |position: &GeolocationPosition| {
                *captured.lock().unwrap() = position.latitude;
            }),
            None,
            None,
        );
        let free_seen = Arc::new(Mutex::new(0.0_f32));
        let captured = free_seen.clone();
        let free_host = backend(true);
        let free_id = watch_geolocation_position(
            &free_host,
            Arc::new(move |position: &GeolocationPosition| {
                *captured.lock().unwrap() = position.latitude;
            }),
            None,
            None,
        );
        assert_eq!(method_id, free_id);
        assert_eq!(*method_seen.lock().unwrap(), *free_seen.lock().unwrap());
    }
}

/// Allocates a zeroed position (TS `createGeolocationPosition`).
pub fn create_geolocation_position() -> GeolocationPosition {
    let mut out: GeolocationPosition = allocate_entity();
    initialize_geolocation_position(&mut out);
    return out;
}

/// Zeroes every field of a position under construction (TS `initializeGeolocationPosition`).
pub fn initialize_geolocation_position(out: &mut GeolocationPosition) {
    out.accuracy = 0.0;
    out.altitude = 0.0;
    out.altitude_accuracy = 0.0;
    out.floor_level = 0.0;
    out.heading = 0.0;
    out.latitude = 0.0;
    out.longitude = 0.0;
    out.speed = 0.0;
    out.timestamp = 0.0;
}

/// Stops a position watch by forwarding its id to the host (TS `clearGeolocationWatch`).
pub fn clear_geolocation_watch(host_geolocation: &HostGeolocationCapability, id: i32) {
    (host_geolocation.clear_watch)(id);
}

/// Reads the current position through the host (TS `getCurrentGeolocationPosition`). `options`
/// defaults to an empty request.
pub async fn get_current_geolocation_position(
    host_geolocation: &HostGeolocationCapability,
    options: Option<&GeolocationRequestOptions>,
) -> Option<GeolocationPosition> {
    let owned_options = options.cloned().unwrap_or_default();
    return (host_geolocation.get_current_position)(owned_options).await;
}

/// Reads the current position together with its failure reason (TS
/// `getCurrentGeolocationPositionResult`). `options` defaults to an empty request.
pub async fn get_current_geolocation_position_result(
    host_geolocation: &HostGeolocationCapability,
    options: Option<&GeolocationRequestOptions>,
) -> GeolocationPositionResult {
    let owned_options = options.cloned().unwrap_or_default();
    return (host_geolocation.get_current_position_result)(owned_options).await;
}

/// Routes the host's availability answer (TS `isGeolocationAvailable`).
pub fn is_geolocation_available(host_geolocation: &HostGeolocationCapability) -> bool {
    return (host_geolocation.is_available)();
}

/// Starts a position watch through the host and returns its watch id (TS
/// `watchGeolocationPosition`). `options` defaults to an empty request.
pub fn watch_geolocation_position(
    host_geolocation: &HostGeolocationCapability,
    handler: Arc<dyn Fn(&GeolocationPosition) + Send + Sync>,
    options: Option<&GeolocationRequestOptions>,
    on_error: Option<Arc<dyn Fn(GeolocationErrorReason) + Send + Sync>>,
) -> i32 {
    let owned_options = options.cloned().unwrap_or_default();
    return (host_geolocation.watch_position)(handler, owned_options, on_error);
}

// ============================================================================
// D18 sugar: methods on the capability delegate to the free functions
// ============================================================================

impl HostGeolocationCapability {
    pub fn clear_watch(&self, id: i32) {
        return clear_geolocation_watch(self, id);
    }

    pub async fn get_current_position(
        &self,
        options: Option<&GeolocationRequestOptions>,
    ) -> Option<GeolocationPosition> {
        return get_current_geolocation_position(self, options).await;
    }

    pub async fn get_current_position_result(
        &self,
        options: Option<&GeolocationRequestOptions>,
    ) -> GeolocationPositionResult {
        return get_current_geolocation_position_result(self, options).await;
    }

    pub fn is_available(&self) -> bool {
        return is_geolocation_available(self);
    }

    pub async fn prompt_for_access(&self) -> GeolocationAccessOutcome {
        return prompt_for_geolocation_access(Some(self)).await;
    }

    pub fn watch_position(
        &self,
        handler: Arc<dyn Fn(&GeolocationPosition) + Send + Sync>,
        options: Option<&GeolocationRequestOptions>,
        on_error: Option<Arc<dyn Fn(GeolocationErrorReason) + Send + Sync>>,
    ) -> i32 {
        return watch_geolocation_position(self, handler, options, on_error);
    }
}
