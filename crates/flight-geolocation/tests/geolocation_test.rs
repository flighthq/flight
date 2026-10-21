use std::sync::{Arc, Mutex};

use flight_geolocation::*;

use crate::block_on;

fn backend(
    available: bool,
) -> (
    HostGeolocationCapability,
    Arc<Mutex<Vec<i32>>>,
    Arc<Mutex<i32>>,
) {
    let cleared = Arc::new(Mutex::new(Vec::new()));
    let cleared_by_host = cleared.clone();
    let last_watch = Arc::new(Mutex::new(0));
    let last_watch_by_host = last_watch.clone();
    let host = HostGeolocationCapability {
        clear_watch: Arc::new(move |id: i32| {
            cleared_by_host.lock().unwrap().push(id);
        }),
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
        watch_position: Arc::new(move |listener: Arc<dyn Fn(&GeolocationPosition) + Send + Sync>,
             _options: GeolocationRequestOptions,
             on_error: Option<Arc<dyn Fn(GeolocationErrorReason) + Send + Sync>>| {
                let mut position = create_geolocation_position();
                position.latitude = 3.0;
                listener(&position);
                if let Some(on_error) = on_error {
                    on_error(GeolocationErrorReason::Denied);
                }
                let mut next = last_watch_by_host.lock().unwrap();
                *next += 1;
                return *next;
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
    return (host, cleared, last_watch);
}

mod clear_geolocation_watch {
    use super::*;

    #[test]
    fn forwards_the_id_to_the_host_backend() {
        let (host, cleared, _) = backend(true);
        flight_geolocation::clear_geolocation_watch(&host, 7);
        assert_eq!(*cleared.lock().unwrap(), vec![7]);
    }
}

mod create_geolocation_position {
    #[test]
    fn allocates_a_zeroed_position() {
        let position = flight_geolocation::create_geolocation_position();
        assert_eq!(position.accuracy, 0.0);
        assert_eq!(position.altitude, 0.0);
        assert_eq!(position.altitude_accuracy, 0.0);
        assert_eq!(position.floor_level, 0.0);
        assert_eq!(position.heading, 0.0);
        assert_eq!(position.latitude, 0.0);
        assert_eq!(position.longitude, 0.0);
        assert_eq!(position.speed, 0.0);
        assert_eq!(position.timestamp, 0.0);
    }
}

mod get_current_geolocation_position {
    use super::*;

    #[test]
    fn returns_the_backend_position() {
        let (host, _, _) = backend(true);
        let position = block_on(flight_geolocation::get_current_geolocation_position(&host, None)).unwrap();
        assert_eq!(position.latitude, 1.0);
        assert_eq!(position.longitude, 2.0);
    }
}

mod get_current_geolocation_position_result {
    use super::*;

    #[test]
    fn returns_position_and_no_reason_on_success() {
        let (host, _, _) = backend(true);
        let result = block_on(flight_geolocation::get_current_geolocation_position_result(&host, None));
        assert!(result.position.is_some());
        assert_eq!(result.position.unwrap().latitude, 1.0);
        assert_eq!(result.reason, None);
    }
}

mod initialize_geolocation_position {
    use super::*;

    #[test]
    fn zeroes_every_field_of_the_position() {
        let mut position = create_geolocation_position();
        position.latitude = 4.0;
        position.longitude = 5.0;
        position.accuracy = 6.0;
        position.altitude = 7.0;
        position.altitude_accuracy = 8.0;
        position.floor_level = 9.0;
        position.heading = 10.0;
        position.speed = 11.0;
        position.timestamp = 12.0;
        flight_geolocation::initialize_geolocation_position(&mut position);
        assert_eq!(position.accuracy, 0.0);
        assert_eq!(position.altitude, 0.0);
        assert_eq!(position.altitude_accuracy, 0.0);
        assert_eq!(position.floor_level, 0.0);
        assert_eq!(position.heading, 0.0);
        assert_eq!(position.latitude, 0.0);
        assert_eq!(position.longitude, 0.0);
        assert_eq!(position.speed, 0.0);
        assert_eq!(position.timestamp, 0.0);
    }
}

mod is_geolocation_available {
    use super::*;

    #[test]
    fn routes_the_host_backend_availability() {
        let (available, _, _) = backend(true);
        assert_eq!(flight_geolocation::is_geolocation_available(&available), true);
        let (unavailable, _, _) = backend(false);
        assert_eq!(flight_geolocation::is_geolocation_available(&unavailable), false);
    }
}

mod watch_geolocation_position {
    use super::*;

    #[test]
    fn delivers_positions_and_returns_a_watch_id() {
        let (host, _, last_watch) = backend(true);
        let seen = Arc::new(Mutex::new(0.0_f32));
        let captured = seen.clone();
        let id = flight_geolocation::watch_geolocation_position(
            &host,
            Arc::new(move |position: &GeolocationPosition| {
                *captured.lock().unwrap() = position.latitude;
            }),
            None,
            None,
        );
        assert_eq!(id, 1);
        assert_eq!(*last_watch.lock().unwrap(), 1);
        assert_eq!(*seen.lock().unwrap(), 3.0);
    }

    #[test]
    fn delivers_error_reasons_when_on_error_is_provided() {
        let (host, _, _) = backend(true);
        let errors = Arc::new(Mutex::new(Vec::new()));
        let captured = errors.clone();
        flight_geolocation::watch_geolocation_position(
            &host,
            Arc::new(|_position: &GeolocationPosition| {}),
            None,
            Some(Arc::new(move |reason: GeolocationErrorReason| {
                captured.lock().unwrap().push(reason);
            })),
        );
        assert_eq!(*errors.lock().unwrap(), vec![GeolocationErrorReason::Denied]);
    }
}
