//! `flighthq-geolocation` — device geolocation over a swappable backend.
//!
//! Ports the TypeScript `@flighthq/geolocation` package. Position reads resolve
//! to `None` and permission requests to `false` when the host denies or lacks
//! access — an expected-failure surface, not a programmer error.
//!
//! The web backend over `navigator.geolocation` lives in `host-web`; the
//! in-crate default is a sentinel backend so every function works without a
//! host (returning `None`/`false`/`-1`).

pub mod geolocation;

pub use geolocation::{
    GEO_WATCH_UNAVAILABLE, clear_geo_watch, create_default_geolocation_backend,
    create_geo_position, get_current_geo_position, get_current_geo_position_result,
    get_geolocation_backend, get_geolocation_permission, is_geolocation_available,
    on_geolocation_permission_change, request_geolocation_permission, set_geolocation_backend,
    watch_geo_position,
};
