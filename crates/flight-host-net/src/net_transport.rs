//! The only module that names the backing HTTP library. Everything else speaks the crate's own
//! transport records, so replacing the library changes this module and `Cargo.toml` only.

use std::cell::Cell;
use std::io::{BufRead, BufReader, Read};
use std::rc::Rc;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use flate2::read::MultiGzDecoder;

use ureq::http;
use ureq::{Agent, ResponseExt};

use crate::types::NetHostResponseExplanationReason;

/// A pooled HTTP client. Clones share one connection pool; `close_net_transport` closes it for
/// every clone at once.
#[derive(Clone)]
pub(crate) struct NetTransport {
    agent: Agent,
    closed: Arc<AtomicBool>,
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
    /// Response headers as the server sent them, in arrival order, names lowercased and repeated
    /// names kept as separate entries. A gzip body is decoded, but its `content-encoding` and
    /// `content-length` headers remain.
    pub(crate) headers: Vec<(String, String)>,
    pub(crate) status: u16,
    pub(crate) status_text: String,
    /// The final URL after any followed redirects.
    pub(crate) url: String,
}

/// The response body as read from the connection, remembering why the connection failed so that
/// failure is not mistaken for a decoding error.
struct NetTransportSourceReader<R: Read> {
    failure: Rc<Cell<Option<NetHostResponseExplanationReason>>>,
    inner: R,
}

pub(crate) fn create_net_transport(max_idle_connections: u32, redirect_limit: u32) -> NetTransport {
    let config = Agent::config_builder()
        .allow_non_standard_methods(true)
        .http_status_as_error(false)
        .user_agent(NET_TRANSPORT_USER_AGENT)
        .max_idle_connections(max_idle_connections as usize)
        .max_idle_connections_per_host(max_idle_connections as usize)
        .save_redirect_history(false)
        .build();
    return NetTransport {
        agent: Agent::new_with_config(config),
        closed: Arc::new(AtomicBool::new(false)),
        redirect_limit,
    };
}

/// Closes every connection in the pool, idle or in use, and refuses new ones. A request blocked on
/// a closed connection fails promptly as `HostDestroyed`.
pub(crate) fn close_net_transport(transport: NetTransport) {
    transport.closed.store(true, Ordering::SeqCst);
    transport.agent.shutdown();
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
    return get_net_transport_io_failure_ref(&error);
}

fn get_net_transport_io_failure_ref(error: &std::io::Error) -> NetHostResponseExplanationReason {
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

fn is_net_transport_gzip(headers: &[(String, String)]) -> bool {
    return headers.iter().any(|(name, value)| {
        return name == "content-encoding" && value.trim().eq_ignore_ascii_case("gzip");
    });
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
    if transport.closed.load(Ordering::SeqCst) {
        return Err(NetHostResponseExplanationReason::HostDestroyed);
    }
    let result = send_net_transport_request(transport, request, on_head, on_chunk);
    // A failure caused by closing the pool reports the close, whatever the socket said.
    return result.map_err(|reason| {
        if transport.closed.load(Ordering::SeqCst)
            && reason != NetHostResponseExplanationReason::Aborted
        {
            return NetHostResponseExplanationReason::HostDestroyed;
        }
        return reason;
    });
}

fn send_net_transport_request(
    transport: &NetTransport,
    request: NetTransportRequest,
    on_head: &mut dyn FnMut(&NetTransportHead),
    on_chunk: &mut dyn FnMut(&[u8]) -> bool,
) -> Result<(NetTransportHead, Vec<u8>), NetHostResponseExplanationReason> {
    let method = http::Method::from_bytes(request.method.as_bytes())
        .map_err(|_| NetHostResponseExplanationReason::InvalidRequest)?;
    let mut builder = http::Request::builder().method(method).uri(&request.url);
    // Like a browser, the transport owns content negotiation: it asks for gzip, the encoding it
    // decodes, in place of any caller value.
    for (name, value) in &request.headers {
        if !name.eq_ignore_ascii_case("accept-encoding") {
            builder = builder.header(name, value);
        }
    }
    builder = builder.header("accept-encoding", "gzip");
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
    // A limit of 0 makes the backing client return the redirect rather than fail, so a follow
    // request with no redirects allowed is checked here.
    let follow_none = request.redirect == NetTransportRedirect::Follow && redirect_limit == 0;
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
    let has_location = response.headers().contains_key(http::header::LOCATION);
    if request.redirect == NetTransportRedirect::Reject && is_net_transport_redirect_status(status)
    {
        return Err(NetHostResponseExplanationReason::RedirectRejected);
    }
    if follow_none && is_net_transport_redirect_status(status) && has_location {
        return Err(NetHostResponseExplanationReason::TooManyRedirects);
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
    let mut raw = BufReader::new(response.into_body().into_reader());
    // An empty body (HEAD, 204, 304) carries no gzip stream even when labelled gzip.
    let has_body = !raw
        .fill_buf()
        .map_err(get_net_transport_io_failure)?
        .is_empty();
    let socket_failure = Rc::new(Cell::new(None));
    let source = NetTransportSourceReader {
        failure: socket_failure.clone(),
        inner: raw,
    };
    let decoding = has_body && is_net_transport_gzip(&head.headers);
    let mut reader: Box<dyn Read> = if decoding {
        Box::new(MultiGzDecoder::new(source))
    } else {
        Box::new(source)
    };
    let mut body = Vec::new();
    let mut chunk = vec![0u8; CHUNK_SIZE];
    loop {
        // A read error the socket did not raise came from decoding the gzip stream.
        let read = reader.read(&mut chunk).map_err(|error| {
            return match socket_failure.take() {
                Some(reason) => reason,
                None if decoding => NetHostResponseExplanationReason::ProtocolError,
                None => get_net_transport_io_failure(error),
            };
        })?;
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

impl<R: Read> Read for NetTransportSourceReader<R> {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        return self.inner.read(buffer).inspect_err(|error| {
            self.failure
                .set(Some(get_net_transport_io_failure_ref(error)));
        });
    }
}

const CHUNK_SIZE: usize = 16 * 1024;

/// Sent on every request, so servers see the host rather than the backing library.
const NET_TRANSPORT_USER_AGENT: &str = "flight-host-net";
