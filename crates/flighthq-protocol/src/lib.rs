//! `flighthq-protocol` — custom URI scheme registration and deep-link
//! open-URL signals over a swappable backend.
//!
//! Free functions delegate to the active [`ProtocolBackend`]. A default
//! sentinel backend is used when no backend has been installed: every command
//! reports failure (`false`) and deep-link delivery is inert, since custom
//! URI-scheme registration needs an OS host. Real hosts supply a backend via
//! [`set_protocol_backend`]. The [`ProtocolHandler`] event entity carries an
//! `on_open_url` signal that stays inert until [`attach_protocol_handler`]
//! wires it to the backend.

pub mod protocol;

pub use protocol::{
    attach_protocol_handler, create_protocol_handler, create_protocol_url, detach_protocol_handler,
    dispose_protocol_handler, get_protocol_backend, get_protocol_launch_url,
    get_registered_protocol_schemes, is_protocol_scheme_default, is_protocol_scheme_registered,
    is_valid_protocol_scheme, parse_protocol_url, register_protocol_scheme,
    register_protocol_schemes, remove_protocol_scheme_as_default, set_protocol_backend,
    set_protocol_scheme_as_default, unregister_protocol_scheme, unregister_protocol_schemes,
};
