//! The capability's request path: snapshot the request on the calling thread, run the transfer on
//! a worker thread, and hand progress and the response back through a future that any executor
//! may poll. Progress is emitted, and the response delivered, on the thread that polls.

use std::cell::Cell;
use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::task::{Context, Poll, Waker};
use std::time::Duration;

use flight_buffer::{ArrayBuffer, create_array_buffer_from_bytes, create_blob};
use flight_entity::{Record, Ref, entries, get_record_value, set_record_value};
use flight_net::{
    NetBody, NetProgress, NetProgressPhase, NetRedirect, NetRequest, NetRequestOptions,
    NetRequestResult, NetResponse, NetResponseBody, NetResponseFuture, NetResponseType,
};
use flight_signals::{Signal, emit_signal};
use flight_stream::{
    AbortCallback, AbortSignal, add_abort_listener, is_abort_signal_aborted, remove_abort_listener,
};

use crate::explain_net_host_response::get_net_host_response_status_text;
use crate::net_transport::{
    NetTransport, NetTransportHead, NetTransportRedirect, NetTransportRequest,
    run_net_transport_request,
};
use crate::types::NetHostResponseExplanationReason;

#[cfg(test)]
mod worker_panic_tests {
    use super::*;

    #[test]
    fn a_panicking_worker_still_completes_the_request() {
        let shared = Arc::new(Mutex::new(NetHostRequestShared::default()));
        let worker_shared = shared.clone();
        let worker = std::thread::spawn(move || {
            run_net_host_request_guarded(worker_shared, || panic!("backing layer panicked"));
        });
        assert!(worker.join().is_err(), "the worker should have panicked");
        let outcome = shared.lock().unwrap().outcome.take();
        assert!(matches!(
            outcome,
            Some(Err(NetHostResponseExplanationReason::NetworkError))
        ));
    }

    #[test]
    fn a_completed_worker_keeps_its_outcome() {
        let shared = Arc::new(Mutex::new(NetHostRequestShared::default()));
        run_net_host_request_guarded(shared.clone(), || {
            return Err(NetHostResponseExplanationReason::Timeout);
        });
        let outcome = shared.lock().unwrap().outcome.take();
        assert!(matches!(
            outcome,
            Some(Err(NetHostResponseExplanationReason::Timeout))
        ));
    }
}

struct NetHostRequestFuture {
    abort_listener: Option<AbortCallback>,
    cancelled: Arc<AtomicBool>,
    progress: Option<Ref<Signal<Ref<NetProgress>>>>,
    shared: Arc<Mutex<NetHostRequestShared>>,
    signal: Option<AbortSignal>,
    url: String,
}

#[derive(Default)]
struct NetHostRequestShared {
    outcome: Option<Result<NetResponse, NetHostResponseExplanationReason>>,
    progress: VecDeque<NetProgress>,
    waker: Option<Waker>,
}

/// Completes its request as `network error` when dropped, unless an outcome is already set. The
/// worker holds one for its whole run, so a panic in the transfer cannot leave the future pending.
struct NetHostRequestCompletion {
    shared: Arc<Mutex<NetHostRequestShared>>,
}

struct NetHostRequestSnapshot {
    request: Result<NetTransportRequest, NetHostResponseExplanationReason>,
    response_type: NetResponseType,
    url: String,
}

fn create_net_host_failure_response(
    url: &str,
    reason: NetHostResponseExplanationReason,
) -> NetResponse {
    return NetResponse {
        status: 0,
        status_text: get_net_host_response_status_text(reason).to_string(),
        ok: false,
        headers: Arc::new(RwLock::new(Record::default())),
        body: None,
        url: url.to_string(),
    };
}

fn create_net_host_invalid_snapshot(request: &NetRequest) -> NetHostRequestSnapshot {
    return NetHostRequestSnapshot {
        request: Err(NetHostResponseExplanationReason::InvalidRequest),
        response_type: request.response_type.unwrap_or(NetResponseType::Text),
        url: request.url.clone(),
    };
}

fn complete_net_host_request(
    shared: &Mutex<NetHostRequestShared>,
    outcome: Result<NetResponse, NetHostResponseExplanationReason>,
) {
    let waker = {
        let mut shared = shared.lock().unwrap();
        if shared.outcome.is_some() {
            return;
        }
        shared.outcome = Some(outcome);
        shared.waker.take()
    };
    if let Some(waker) = waker {
        waker.wake();
    }
}

fn decode_net_host_response_body(
    bytes: Vec<u8>,
    response_type: NetResponseType,
    content_type: &str,
) -> NetResponseBody {
    return match response_type {
        NetResponseType::ArrayBuffer => {
            NetResponseBody::Buffer(create_array_buffer_from_bytes(bytes.into_boxed_slice()))
        }
        NetResponseType::Blob => {
            let size = bytes.len();
            let buffer: ArrayBuffer = create_array_buffer_from_bytes(bytes.into_boxed_slice());
            let read_buffer = buffer.clone();
            NetResponseBody::Blob(create_blob(
                content_type.to_ascii_lowercase(),
                size,
                Some(Arc::new(buffer)),
                Some(Arc::new(move || {
                    let buffer = read_buffer.clone();
                    return Box::pin(async move { Ok(buffer) });
                })),
            ))
        }
        NetResponseType::Json => {
            match serde_json::from_slice::<serde_json::Value>(strip_utf8_bom(&bytes)) {
                Ok(value) => NetResponseBody::Unknown(Some(Arc::new(value))),
                Err(_) => NetResponseBody::Unknown(None),
            }
        }
        NetResponseType::Text => {
            NetResponseBody::Text(String::from_utf8_lossy(strip_utf8_bom(&bytes)).into_owned())
        }
    };
}

fn get_net_host_content_length(head: &NetTransportHead) -> usize {
    return head
        .headers
        .iter()
        .find(|(name, _)| name == "content-length")
        .and_then(|(_, value)| value.trim().parse::<usize>().ok())
        .unwrap_or(0);
}

/// Methods the Fetch standard normalizes to upper case; every other method is sent as written.
fn normalize_net_host_method(method: &str) -> String {
    let upper = method.to_ascii_uppercase();
    if matches!(
        upper.as_str(),
        "DELETE" | "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT"
    ) {
        return upper;
    }
    return method.to_string();
}

fn poll_net_host_request(
    future: &mut NetHostRequestFuture,
    context: &mut Context<'_>,
) -> Poll<NetRequestResult> {
    if future.abort_listener.is_none()
        && let Some(signal) = future.signal.clone()
    {
        let shared = future.shared.clone();
        let cancelled = future.cancelled.clone();
        let listener: AbortCallback = Arc::new(move || {
            cancelled.store(true, Ordering::SeqCst);
            complete_net_host_request(&shared, Err(NetHostResponseExplanationReason::Aborted));
        });
        add_abort_listener(&signal, listener.clone());
        future.abort_listener = Some(listener);
        // An abort between creating the future and registering the listener is not dispatched
        // to the listener, so it is read here once.
        if is_abort_signal_aborted(&signal) {
            future.cancelled.store(true, Ordering::SeqCst);
            complete_net_host_request(
                &future.shared,
                Err(NetHostResponseExplanationReason::Aborted),
            );
        }
    }
    let (progress, outcome) = {
        let mut shared = future.shared.lock().unwrap();
        let progress: Vec<NetProgress> = shared.progress.drain(..).collect();
        let outcome = shared.outcome.take();
        if outcome.is_none() {
            shared.waker = Some(context.waker().clone());
        }
        (progress, outcome)
    };
    if let Some(signal) = &future.progress {
        let signal = signal.read().unwrap().clone();
        for value in progress {
            emit_signal(&signal, &Arc::new(RwLock::new(value)));
        }
    }
    let Some(outcome) = outcome else {
        return Poll::Pending;
    };
    let response = match outcome {
        Ok(response) => response,
        Err(reason) => create_net_host_failure_response(&future.url, reason),
    };
    return Poll::Ready(Ok(Arc::new(RwLock::new(response))));
}

fn push_net_host_progress(shared: &Mutex<NetHostRequestShared>, progress: NetProgress) {
    let waker = {
        let mut shared = shared.lock().unwrap();
        shared.progress.push_back(progress);
        shared.waker.take()
    };
    if let Some(waker) = waker {
        waker.wake();
    }
}

/// Runs `work` and completes the request with its outcome. If `work` panics, the request still
/// completes, as `network error`, while the panic unwinds, so its future always resolves.
fn run_net_host_request_guarded(
    shared: Arc<Mutex<NetHostRequestShared>>,
    work: impl FnOnce() -> Result<NetResponse, NetHostResponseExplanationReason>,
) {
    let completion = NetHostRequestCompletion { shared };
    let outcome = work();
    complete_net_host_request(&completion.shared, outcome);
}

fn run_net_host_request_worker(
    transport: &NetTransport,
    request: NetTransportRequest,
    response_type: NetResponseType,
    shared: &Mutex<NetHostRequestShared>,
    cancelled: &AtomicBool,
) -> Result<NetResponse, NetHostResponseExplanationReason> {
    let total = Cell::new(0);
    let mut loaded = 0;
    let result = run_net_transport_request(
        transport,
        request,
        &mut |head| total.set(get_net_host_content_length(head)),
        &mut |chunk| {
            if cancelled.load(Ordering::SeqCst) {
                return false;
            }
            loaded += chunk.len();
            push_net_host_progress(
                shared,
                NetProgress {
                    phase: NetProgressPhase::Download,
                    loaded,
                    total: total.get(),
                },
            );
            return true;
        },
    );
    return result.map(|(head, bytes)| {
        let mut headers = Record::default();
        for (name, value) in head.headers {
            let joined = match get_record_value(&headers, &name) {
                Some(existing) => format!("{existing}, {value}"),
                None => value,
            };
            set_record_value(&mut headers, name, joined);
        }
        let content_type = get_record_value(&headers, "content-type")
            .cloned()
            .unwrap_or_default();
        return NetResponse {
            status: u32::from(head.status),
            status_text: head.status_text,
            ok: (200..300).contains(&head.status),
            headers: Arc::new(RwLock::new(headers)),
            body: Some(decode_net_host_response_body(
                bytes,
                response_type,
                &content_type,
            )),
            url: head.url,
        };
    });
}

pub(crate) fn send_net_host_request(
    transport: &Arc<RwLock<Option<NetTransport>>>,
    request: Ref<NetRequest>,
    options: Option<Ref<NetRequestOptions>>,
) -> NetResponseFuture {
    let (progress, signal) = match &options {
        Some(options) => {
            let options = options.read().unwrap();
            (options.progress.clone(), options.signal.clone())
        }
        None => (None, None),
    };
    let snapshot = snapshot_net_host_request(&request.read().unwrap());
    let url = snapshot.url.clone();
    let shared = Arc::new(Mutex::new(NetHostRequestShared::default()));
    let cancelled = Arc::new(AtomicBool::new(false));
    let future = NetHostRequestFuture {
        abort_listener: None,
        cancelled: cancelled.clone(),
        progress,
        shared: shared.clone(),
        signal,
        url: url.clone(),
    };
    if future.signal.as_ref().is_some_and(is_abort_signal_aborted) {
        complete_net_host_request(&shared, Err(NetHostResponseExplanationReason::Aborted));
        return Box::pin(future);
    }
    let transport = transport.read().unwrap().clone();
    let outcome = match (transport, snapshot.request) {
        (None, _) => Some(Err(NetHostResponseExplanationReason::HostDestroyed)),
        (Some(_), Err(reason)) => Some(Err(reason)),
        (Some(transport), Ok(transport_request)) => {
            let worker_shared = shared.clone();
            let response_type = snapshot.response_type;
            let spawned = std::thread::Builder::new()
                .name("flight-net-request".to_string())
                .spawn(move || {
                    let progress_shared = worker_shared.clone();
                    run_net_host_request_guarded(worker_shared, move || {
                        return run_net_host_request_worker(
                            &transport,
                            transport_request,
                            response_type,
                            &progress_shared,
                            &cancelled,
                        );
                    });
                });
            match spawned {
                Ok(_) => None,
                Err(_) => Some(Err(NetHostResponseExplanationReason::NetworkError)),
            }
        }
    };
    if let Some(outcome) = outcome {
        complete_net_host_request(&shared, outcome);
    }
    return Box::pin(future);
}

fn snapshot_net_host_request(request: &NetRequest) -> NetHostRequestSnapshot {
    let method = normalize_net_host_method(&request.method);
    let body = match request.body.clone().flatten() {
        None => None,
        Some(NetBody::Text(text)) => Some((text.into_bytes(), Some(NET_HOST_TEXT_CONTENT_TYPE))),
        Some(NetBody::Buffer(buffer)) => {
            let storage = flight_buffer::get_array_buffer_storage(&buffer);
            let bytes = storage.read().unwrap().to_vec();
            Some((bytes, None))
        }
        Some(NetBody::View(view)) => {
            let storage = flight_buffer::get_array_buffer_storage(&view.buffer);
            let bytes = view
                .byte_offset
                .checked_add(view.byte_length)
                .and_then(|end| {
                    storage
                        .read()
                        .unwrap()
                        .get(view.byte_offset..end)
                        .map(<[u8]>::to_vec)
                });
            match bytes {
                Some(bytes) => Some((bytes, None)),
                None => return create_net_host_invalid_snapshot(request),
            }
        }
    };
    let mut headers = Vec::new();
    if let Some(record) = &request.headers {
        let record = record.read().unwrap();
        let mut pairs = Vec::new();
        entries(&mut pairs, &record);
        for (name, value) in pairs {
            headers.push((name.to_string(), value.clone()));
        }
    }
    let transport_request = if body.is_some() && (method == "GET" || method == "HEAD") {
        // The Fetch standard rejects a body on GET and HEAD rather than dropping it.
        Err(NetHostResponseExplanationReason::InvalidRequest)
    } else {
        let mut body_bytes = None;
        if let Some((bytes, default_content_type)) = body {
            let has_content_type = headers
                .iter()
                .any(|(name, _)| name.eq_ignore_ascii_case("content-type"));
            if let (Some(content_type), false) = (default_content_type, has_content_type) {
                headers.push(("content-type".to_string(), content_type.to_string()));
            }
            body_bytes = Some(bytes);
        }
        // Negative timeouts are ignored, as the web backend ignores them. Larger finite values are
        // clamped so the deadline arithmetic stays in range.
        let timeout = request
            .timeout_ms
            .filter(|timeout| *timeout >= 0.0 && timeout.is_finite())
            .map(|timeout| Duration::from_secs_f32(timeout.min(NET_HOST_MAX_TIMEOUT_MS) / 1000.0));
        let redirect = match request.redirect.unwrap_or(NetRedirect::Follow) {
            NetRedirect::Follow => NetTransportRedirect::Follow,
            NetRedirect::Error => NetTransportRedirect::Reject,
            NetRedirect::Manual => NetTransportRedirect::Return,
        };
        Ok(NetTransportRequest {
            body: body_bytes,
            headers,
            method,
            redirect,
            timeout,
            url: request.url.clone(),
        })
    };
    return NetHostRequestSnapshot {
        request: transport_request,
        response_type: request.response_type.unwrap_or(NetResponseType::Text),
        url: request.url.clone(),
    };
}

fn strip_utf8_bom(bytes: &[u8]) -> &[u8] {
    return bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
}

/// The longest timeout a request keeps, in milliseconds (about 31 years); longer finite timeouts
/// are clamped to it.
pub(crate) const NET_HOST_MAX_TIMEOUT_MS: f32 = 1.0e12;

/// The content type the Fetch standard gives a text body when the caller sets none.
const NET_HOST_TEXT_CONTENT_TYPE: &str = "text/plain;charset=UTF-8";

impl Future for NetHostRequestFuture {
    type Output = NetRequestResult;

    fn poll(mut self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<NetRequestResult> {
        return poll_net_host_request(&mut self, context);
    }
}

impl Drop for NetHostRequestCompletion {
    fn drop(&mut self) {
        complete_net_host_request(
            &self.shared,
            Err(NetHostResponseExplanationReason::NetworkError),
        );
    }
}

impl Drop for NetHostRequestFuture {
    fn drop(&mut self) {
        // A dropped future stops its worker at the next body chunk.
        self.cancelled.store(true, Ordering::SeqCst);
        if let (Some(signal), Some(listener)) = (&self.signal, &self.abort_listener) {
            remove_abort_listener(signal, listener);
        }
    }
}
