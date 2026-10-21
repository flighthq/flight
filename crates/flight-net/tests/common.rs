use flight_entity::{Record, Unknown, set_record_value};
use flight_net::contract::*;
use std::sync::{Arc, RwLock};

// Rust fixture for a source plain-object literal; canonical Record has private storage and no Entity factory.
pub(crate) fn fields(pairs: &[(&str, &str)]) -> Record<String> {
    let mut fields = Record::default();
    for (key, value) in pairs {
        set_record_value(&mut fields, key.to_string(), value.to_string());
    }
    return fields;
}

// Rust fixture for source plain headers; canonical Record has private storage and no Entity factory.
pub(crate) fn response(status: u32, status_text: &str, body: Unknown) -> NetResponse {
    return NetResponse {
        status,
        status_text: status_text.to_string(),
        ok: status >= 200 && status < 300,
        headers: Arc::new(RwLock::new(Record::default())),
        body: body.map(|body| NetResponseBody::Unknown(Some(body))),
        url: "u".to_string(),
    };
}

pub(crate) fn block_on<F: std::future::Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = std::task::Context::from_waker(std::task::Waker::noop());
    loop {
        match future.as_mut().poll(&mut context) {
            std::task::Poll::Ready(value) => return value,
            std::task::Poll::Pending => std::thread::yield_now(),
        }
    }
}

pub(crate) fn net_request(method: &str, url: &str) -> flight_entity::Ref<NetRequest> {
    return Arc::new(RwLock::new(NetRequest {
        method: method.to_string(),
        url: url.to_string(),
        headers: None,
        body: None,
        response_type: None,
        timeout_ms: None,
        credentials: None,
        redirect: None,
    }));
}

pub(crate) fn net_options() -> flight_entity::Ref<NetRequestOptions> {
    return Arc::new(RwLock::new(NetRequestOptions {
        progress: None,
        signal: None,
    }));
}

// Plain D5 context fixture has no invented Entity constructor.
pub(crate) fn net_state() -> NetState {
    return NetState::default();
}

pub(crate) fn host_net(response: flight_entity::Ref<NetResponse>) -> HostNetCapability {
    return HostNetCapability {
        provider: Arc::new(()),
        send_net_request: Arc::new(move |_, _| {
            let response = response.clone();
            Box::pin(async move { Ok(response) })
        }),
    };
}

pub(crate) fn progress_signal()
-> flight_entity::Ref<flight_signals::Signal<flight_entity::Ref<NetProgress>>> {
    return Arc::new(RwLock::new(flight_signals::create_signal()));
}

pub(crate) fn progress_tick() -> flight_entity::Ref<NetProgress> {
    return Arc::new(RwLock::new(NetProgress {
        phase: NetProgressPhase::Download,
        loaded: 1,
        total: 1,
    }));
}

pub(crate) fn programmer_error() -> flight_entity::FlightError {
    return flight_entity::FlightError {
        kind: flight_entity::FlightErrorKind::TypeError,
        message: "provider programmer misuse".to_string(),
    };
}

pub(crate) struct PendingResponse(pub std::sync::Arc<std::sync::Mutex<Option<NetRequestResult>>>);
impl std::future::Future for PendingResponse {
    type Output = NetRequestResult;
    fn poll(
        self: std::pin::Pin<&mut Self>,
        _context: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        return match self.0.lock().unwrap().take() {
            Some(result) => std::task::Poll::Ready(result),
            None => std::task::Poll::Pending,
        };
    }
}
