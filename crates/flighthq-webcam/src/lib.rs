//! `flighthq-webcam` — webcam capture and photo picking over a swappable
//! backend.
//!
//! Ports the TypeScript `@flighthq/webcam` package (formerly `@flighthq/camera`;
//! the `camera` name now belongs to the 3D scene camera). Free functions
//! delegate to the active [`WebcamBackend`]; capture returns `None` when the
//! host denies, the user cancels, or the capability is absent — an
//! expected-failure surface, not a programmer error.
//!
//! The box has no DOM substrate, so the lazily-created web default
//! ([`create_web_webcam_backend`]) is a seam-with-sentinel: every method
//! resolves to its sentinel (`None`/`false`) until a native or web host installs
//! a real backend via [`set_webcam_backend`]. There is always a backend.

pub mod webcam;

pub use webcam::{
    create_web_webcam_backend, get_webcam_backend, pick_webcam_image, record_webcam_video,
    request_webcam_permission, set_webcam_backend, take_webcam_photo,
};
