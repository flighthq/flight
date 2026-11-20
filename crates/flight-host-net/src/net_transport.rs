//! The only module that names the backing HTTP library. Everything else speaks the crate's own
//! transport records, so replacing the library changes this module and `Cargo.toml` only.

use std::io::Read;
use std::time::Duration;

use ureq::http;
use ureq::{Agent, ResponseExt};

use crate::types::NetHostResponseExplanationReason;

/// A pooled HTTP client. Clones share one connection pool, which closes when the last clone drops.
#[derive(Clone)]
pub(crate) struct NetTransport {
    agent: Agent,
    redirect_limit: u32,
}

/// How a transport request treats a redirect response.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NetTransportRedirect {
    Follow,
    Reject,
    Return,
}

/// One request as the transport sends it: already validated for body/method pairing and with the
/// method normalized.
pub(crate) struct NetTransportRequest {
    pub(crate) body: Option<Vec<u8>>,
    pub(crate) headers: Vec<(String, String)>,
    pub(crate) method: String,
    pub(crate) redirect: NetTransportRedirect,
    pub(crate) timeout: Option<Duration>,
    pub(crate) url: String,
}

/// The status line and headers of a response, available before its body is read.
pub(crate) struct NetTransportHead {
    /// Response headers in arrival order, names lowercased, repeated names kept as separate entries.
    pub(crate) headers: Vec<(String, String)>,
    pub(crate) status: u16,
    pub(crate) status_text: String,
    /// The final URL after any followed redirects.
    pub(crate) url: String,
}

pub(crate) fn create_net_transport(max_idle_connections: u32, redirect_limit: u32) -> NetTransport {
    let config = Agent::config_builder()
        .allow_non_standard_methods(true)
        .http_status_as_error(false)
        .max_idle_connections(max_idle_connections as usize)
        .max_idle_connections_per_host(max_idle_connections as usize)
        .save_redirect_history(false)
        .build();
    return NetTransport {
        agent: Agent::new_with_config(config),
        redirect_limit,
    };
}

fn get_net_transport_failure(error: ureq::Error) -> NetHostResponseExplanationReason {
    return match error {
        ureq::Error::Timeout(_) => NetHostResponseExplanationReason::Timeout,
        ureq::Error::HostNotFound => NetHostResponseExplanationReason::HostNotFound,
        ureq::Error::ConnectionFailed => NetHostResponseExplanationReason::ConnectionFailed,
        ureq::Error::TooManyRedirects => NetHostResponseExplanationReason::TooManyRedirects,
        ureq::Error::RedirectFailed => NetHostResponseExplanationReason::ProtocolError,
        ureq::Error::BadUri(_) | ureq::Error::Http(_) => {
            NetHostResponseExplanationReason::InvalidRequest
        }
        ureq::Error::Protocol(_) => NetHostResponseExplanationReason::ProtocolError,
        ureq::Error::Tls(_) => NetHostResponseExplanationReason::TlsFailure,
        #[cfg(feature = "https")]
        ureq::Error::Rustls(_) => NetHostResponseExplanationReason::TlsFailure,
        ureq::Error::RequireHttpsOnly(_) | ureq::Error::TlsRequired => {
            NetHostResponseExplanationReason::UnsupportedScheme
        }
        ureq::Error::Io(error) => get_net_transport_io_failure(error),
        _ => NetHostResponseExplanationReason::NetworkError,
    };
}

fn get_net_transport_io_failure(error: std::io::Error) -> NetHostResponseExplanationReason {
    if let Some(inner) = error
        .get_ref()
        .and_then(|inner| inner.downcast_ref::<ureq::Error>())
    {
        if let ureq::Error::Timeout(_) = inner {
            return NetHostResponseExplanationReason::Timeout;
        }
        if let ureq::Error::Protocol(_) = inner {
            return NetHostResponseExplanationReason::ProtocolError;
        }
    }
    return match error.kind() {
        std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock => {
            NetHostResponseExplanationReason::Timeout
        }
        std::io::ErrorKind::ConnectionRefused => NetHostResponseExplanationReason::ConnectionFailed,
        _ => NetHostResponseExplanationReason::NetworkError,
    };
}

fn is_net_transport_redirect_status(status: http::StatusCode) -> bool {
    return matches!(status.as_u16(), 301 | 302 | 303 | 307 | 308);
}

/// Sends `request` and reads the response body to the end. `on_head` sees the head once before any
/// body bytes; `on_chunk` sees each body chunk as it arrives and returns false to stop the read,
/// which ends the request as `Aborted`.
pub(crate) fn run_net_transport_request(
    transport: &NetTransport,
    request: NetTransportRequest,
    on_head: &mut dyn FnMut(&NetTransportHead),
    on_chunk: &mut dyn FnMut(&[u8]) -> bool,
) -> Result<(NetTransportHead, Vec<u8>), NetHostResponseExplanationReason> {
    let method = http::Method::from_bytes(request.method.as_bytes())
        .map_err(|_| NetHostResponseExplanationReason::InvalidRequest)?;
    let mut builder = http::Request::builder().method(method).uri(&request.url);
    for (name, value) in &request.headers {
        builder = builder.header(name, value);
    }
    let http_request = builder
        .body(request.body.unwrap_or_default())
        .map_err(|_| NetHostResponseExplanationReason::InvalidRequest)?;
    match http_request.uri().scheme_str() {
        Some("http") => {}
        Some("https") if cfg!(feature = "https") => {}
        Some(_) => return Err(NetHostResponseExplanationReason::UnsupportedScheme),
        None => return Err(NetHostResponseExplanationReason::InvalidRequest),
    }
    let redirect_limit = match request.redirect {
        NetTransportRedirect::Follow => transport.redirect_limit,
        NetTransportRedirect::Reject | NetTransportRedirect::Return => 0,
    };
    let configured = transport
        .agent
        .configure_request(http_request)
        .max_redirects(redirect_limit)
        .max_redirects_will_error(request.redirect == NetTransportRedirect::Follow)
        .timeout_global(request.timeout)
        .build();
    let response = transport
        .agent
        .run(configured)
        .map_err(get_net_transport_failure)?;
    let status = response.status();
    if request.redirect == NetTransportRedirect::Reject && is_net_transport_redirect_status(status)
    {
        return Err(NetHostResponseExplanationReason::RedirectRejected);
    }
    let headers = response
        .headers()
        .iter()
        .map(|(name, value)| {
            // Header values are byte strings; each byte maps to the code point of the same value.
            let value: String = value
                .as_bytes()
                .iter()
                .map(|byte| char::from(*byte))
                .collect();
            return (name.as_str().to_string(), value);
        })
        .collect();
    let head = NetTransportHead {
        headers,
        status: status.as_u16(),
        // The backing protocol layer does not keep the server's reason phrase, so the standard
        // phrase for the status stands in for it; HTTP/2 responses carry none either.
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        url: response.get_uri().to_string(),
    };
    on_head(&head);
    let mut reader = response.into_body().into_reader();
    let mut body = Vec::new();
    let mut chunk = vec![0u8; CHUNK_SIZE];
    loop {
        let read = reader
            .read(&mut chunk)
            .map_err(get_net_transport_io_failure)?;
        if read == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..read]);
        if !on_chunk(&chunk[..read]) {
            return Err(NetHostResponseExplanationReason::Aborted);
        }
    }
    return Ok((head, body));
}

const CHUNK_SIZE: usize = 16 * 1024;
