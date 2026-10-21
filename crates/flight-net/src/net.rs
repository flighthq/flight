use crate::enums::{NetGuardOperation, NetGuardReason, NetResponseExplanationReason};
use crate::types::*;
use flight_entity::Ref;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use flight_entity::Record;
    use std::sync::{Arc, RwLock};

    #[test]
    fn explain_matches_the_free_sentinel_and_preserves_original_metadata() {
        let response = NetResponse {
            status: 0,
            status_text: " AbOrTeD ".to_string(),
            ok: false,
            headers: Arc::new(RwLock::new(Record::default())),
            body: None,
            url: "original URL".to_string(),
        };
        assert_eq!(response.explain(), explain_net_response(&response));
        assert_eq!(
            response.explain().unwrap().reason,
            NetResponseExplanationReason::Aborted
        );
    }

    #[test]
    fn send_method_matches_free_response_identity_and_original_request_dispatch() {
        use std::future::Future;
        use std::task::{Context, Poll, Waker};
        fn block_on<F: Future>(future: F) -> F::Output {
            let mut future = Box::pin(future);
            let mut context = Context::from_waker(Waker::noop());
            loop {
                match future.as_mut().poll(&mut context) {
                    Poll::Ready(value) => return value,
                    Poll::Pending => std::thread::yield_now(),
                }
            }
        }
        let request = Arc::new(RwLock::new(NetRequest {
            method: "CUSTOM".to_string(),
            url: "u".to_string(),
            headers: None,
            body: None,
            response_type: None,
            timeout_ms: None,
            credentials: None,
            redirect: None,
        }));
        let response = Arc::new(RwLock::new(NetResponse {
            status: 404,
            status_text: "Not Found".to_string(),
            ok: false,
            headers: Arc::new(RwLock::new(Record::default())),
            body: None,
            url: "u".to_string(),
        }));
        let expected_request = request.clone();
        let expected_response = response.clone();
        let calls = Arc::new(std::sync::Mutex::new(0));
        let count = calls.clone();
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |request, options| {
                assert!(Arc::ptr_eq(&request, &expected_request));
                assert!(options.is_none());
                *count.lock().unwrap() += 1;
                let response = expected_response.clone();
                Box::pin(async move { Ok(response) })
            }),
        };
        let state = NetState {
            data: Arc::new(RwLock::new(NetStateData {
                guard: None,
                enabled: false,
            })),
        };
        let method = block_on(host.send_request(&request, None, &state)).unwrap();
        let function = block_on(send_net_request(&host, &request, None, &state)).unwrap();
        assert!(Arc::ptr_eq(&method, &function));
        assert!(Arc::ptr_eq(&method, &response));
        assert_eq!(*calls.lock().unwrap(), 2);
    }
}

pub fn explain_net_response(response: &NetResponse) -> Option<NetResponseExplanation> {
    let reason = if response.status == 0 {
        let status_text = response
            .status_text
            .trim_matches(is_javascript_whitespace)
            .to_lowercase();
        match status_text.as_str() {
            "aborted" => NetResponseExplanationReason::Aborted,
            "timeout" => NetResponseExplanationReason::Timeout,
            _ => NetResponseExplanationReason::TransportFailure,
        }
    } else if matches!(response.body, None | Some(NetResponseBody::Unknown(None))) {
        NetResponseExplanationReason::DecodeFailure
    } else {
        return None;
    };
    return Some(NetResponseExplanation {
        reason,
        status: response.status,
        status_text: response.status_text.clone(),
        url: response.url.clone(),
    });
}

fn is_javascript_whitespace(character: char) -> bool {
    return matches!(character, '\u{0009}'..='\u{000D}' | '\u{0020}' | '\u{00A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}');
}

// flight-lint: allow(conform-params) D5 explicit state replaces the module-global guard; source options retain their original third position
pub async fn send_net_request(
    host_net: &HostNetCapability,
    request: &Ref<NetRequest>,
    options: Option<&Ref<NetRequestOptions>>,
    state: &NetState,
) -> NetRequestResult {
    let guard = state.data.read().unwrap().guard.clone();
    let Some(guard) = guard else {
        return (host_net.send_net_request)(request.clone(), options.cloned()).await;
    };
    let body_on_bodyless_method = {
        let request = request.read().unwrap();
        let method = request.method.to_uppercase();
        (method == "GET" || method == "HEAD")
            && request.body.as_ref().is_some_and(|body| body.is_some())
    };
    if body_on_bodyless_method {
        guard(Arc::new(RwLock::new(NetGuardNotice {
            operation: NetGuardOperation::SendNetRequest,
            reason: NetGuardReason::BodyOnGetOrHead,
            request: request.clone(),
        })));
    }
    // The source reads timeout AFTER the first callback, which may edit the retained request.
    let negative_timeout = request
        .read()
        .unwrap()
        .timeout_ms
        .is_some_and(|timeout| timeout < 0.0);
    if negative_timeout {
        guard(Arc::new(RwLock::new(NetGuardNotice {
            operation: NetGuardOperation::SendNetRequest,
            reason: NetGuardReason::NegativeTimeout,
            request: request.clone(),
        })));
    }
    let progress = options.and_then(|options| options.read().unwrap().progress.clone());
    let Some(progress) = progress else {
        return (host_net.send_net_request)(request.clone(), options.cloned()).await;
    };
    let emitted = Arc::new(AtomicBool::new(false));
    let callback_emitted = emitted.clone();
    let original_progress = progress.clone();
    let guarded_progress = progress.read().unwrap().clone();
    *guarded_progress.emit.write().unwrap() = Arc::new(move |value| {
        callback_emitted.store(true, Ordering::SeqCst);
        let emit_cell = original_progress.read().unwrap().emit.clone();
        let emit = emit_cell.read().unwrap().clone();
        emit(value);
    });
    let signal = options.and_then(|options| options.read().unwrap().signal.clone());
    let wrapped_options = Arc::new(RwLock::new(NetRequestOptions {
        progress: Some(Arc::new(RwLock::new(guarded_progress))),
        signal,
    }));
    let response = (host_net.send_net_request)(request.clone(), Some(wrapped_options)).await?;
    if !emitted.load(Ordering::SeqCst) && response.read().unwrap().status != 0 {
        guard(Arc::new(RwLock::new(NetGuardNotice {
            operation: NetGuardOperation::SendNetRequest,
            reason: NetGuardReason::ProgressNotEmitted,
            request: request.clone(),
        })));
    }
    return Ok(response);
}

// flight-lint: allow(conform-params) D5 explicit caller-owned guard slot replaces the hidden module singleton
pub fn set_net_guard(state: &NetState, guard: Option<NetGuard>) {
    state.data.write().unwrap().guard = guard;
}

impl NetResponse {
    pub fn explain(&self) -> Option<NetResponseExplanation> {
        return explain_net_response(self);
    }
}

impl HostNetCapability {
    pub async fn send_request(
        &self,
        request: &Ref<NetRequest>,
        options: Option<&Ref<NetRequestOptions>>,
        state: &NetState,
    ) -> NetRequestResult {
        return send_net_request(self, request, options, state).await;
    }
}
