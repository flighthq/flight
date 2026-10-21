use crate::types::{LoadOptions, LoadProgress};
use flight_buffer::{
    ArrayBuffer, ArrayBufferView, ArrayBufferViewKind, create_array_buffer_view,
    get_array_buffer_byte_length,
};
use flight_entity::{Ref, throw_type_error};
use flight_net::{
    HostNetCapability, NetProgress, NetRequest, NetRequestOptions, NetResponseBody,
    NetResponseType, NetState, send_net_request,
};
use flight_signals::{connect_signal, create_signal, emit_signal};
use futures::FutureExt;
use std::panic::AssertUnwindSafe;
use std::sync::{Arc, RwLock};

// flight-lint: allow(conform-params) D5 explicit canonical NetState replaces hidden transport guard state
pub async fn load_bytes(
    host_net: &HostNetCapability,
    url: &str,
    input: Option<&Ref<LoadOptions>>,
    net_state: &NetState,
) -> Option<ArrayBufferView> {
    return AssertUnwindSafe(async {
        let request = request(url, NetResponseType::ArrayBuffer);
        let options = request_options(url, input);
        let response = send_net_request(host_net, &request, options.as_ref(), net_state)
            .await
            .ok()?;
        let response = response.read().unwrap();
        if !response.ok {
            return None;
        }
        let buffer = match response.body.as_ref()? {
            NetResponseBody::Buffer(buffer) => buffer,
            NetResponseBody::Unknown(Some(value)) => value.downcast_ref::<ArrayBuffer>()?,
            _ => return None,
        };
        return create_array_buffer_view(
            buffer,
            0,
            get_array_buffer_byte_length(buffer),
            ArrayBufferViewKind::Uint8Array,
        );
    })
    .catch_unwind()
    .await
    .unwrap_or(None);
}

// flight-lint: allow(conform-params) D5 explicit canonical NetState replaces hidden transport guard state
pub async fn load_text(
    host_net: &HostNetCapability,
    url: &str,
    input: Option<&Ref<LoadOptions>>,
    net_state: &NetState,
) -> Option<String> {
    return AssertUnwindSafe(async {
        let request = request(url, NetResponseType::Text);
        let options = request_options(url, input);
        let response = send_net_request(host_net, &request, options.as_ref(), net_state)
            .await
            .ok()?;
        let response = response.read().unwrap();
        if !response.ok {
            return None;
        }
        return match response.body.as_ref()? {
            NetResponseBody::Text(text) => Some(text.clone()),
            NetResponseBody::Unknown(Some(value)) => value.downcast_ref::<String>().cloned(),
            _ => None,
        };
    })
    .catch_unwind()
    .await
    .unwrap_or(None);
}

fn request(url: &str, response_type: NetResponseType) -> Ref<NetRequest> {
    return Arc::new(RwLock::new(NetRequest {
        method: "GET".to_string(),
        url: url.to_string(),
        headers: None,
        body: None,
        response_type: Some(response_type),
        timeout_ms: None,
        credentials: None,
        redirect: None,
    }));
}

fn request_options(url: &str, input: Option<&Ref<LoadOptions>>) -> Option<Ref<NetRequestOptions>> {
    let input = input?;
    let has_progress = input.read().unwrap().progress.is_some();
    let progress = if has_progress {
        let progress = create_signal::<Ref<NetProgress>>();
        let input = input.clone();
        let url = url.to_string();
        connect_signal(
            &progress,
            Arc::new(move |event| {
                let event = event.read().unwrap();
                let value = Arc::new(RwLock::new(LoadProgress {
                    url: url.clone(),
                    loaded: event.loaded,
                    total: event.total,
                    phase: event.phase,
                }));
                drop(event);
                let target = input.read().unwrap().progress.clone();
                let Some(target) = target else {
                    throw_type_error("Load progress signal is missing");
                };
                let target = target.read().unwrap().clone();
                emit_signal(&target, &value);
            }),
            None,
        );
        Some(Arc::new(RwLock::new(progress)))
    } else {
        None
    };
    let signal = input.read().unwrap().signal.clone();
    return Some(Arc::new(RwLock::new(NetRequestOptions {
        progress,
        signal,
    })));
}
