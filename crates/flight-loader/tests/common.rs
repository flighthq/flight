use flight_entity::{Record, Ref};
use flight_net::{HostNetCapability, NetResponse, NetResponseBody, NetState};
use std::sync::{Arc, RwLock};

pub(crate) fn block_on<F: std::future::Future>(future: F) -> F::Output {
    return futures::executor::block_on(future);
}

// Plain D5 context and source object literal fixtures, without invented Entity factories.
pub(crate) fn net_state() -> NetState {
    return NetState::default();
}

pub(crate) fn response(ok: bool, body: Option<NetResponseBody>) -> Ref<NetResponse> {
    return Arc::new(RwLock::new(NetResponse {
        status: if ok { 200 } else { 0 },
        status_text: String::new(),
        ok,
        headers: Arc::new(RwLock::new(Record::default())),
        body,
        url: "response URL".to_string(),
    }));
}

pub(crate) fn host(body: Option<NetResponseBody>) -> HostNetCapability {
    return HostNetCapability {
        provider: Arc::new(()),
        send_net_request: Arc::new(move |_, _| {
            let response = response(true, body.clone());
            Box::pin(async move { Ok(response) })
        }),
    };
}
