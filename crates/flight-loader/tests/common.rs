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

use crate::mock_host::MockHost;
use flight_loader::contract::*;
use flight_stream::{SharedFuture, create_shared_future};
use futures::FutureExt;
use futures::channel::oneshot;
use std::sync::Mutex;

pub(crate) fn context(host: &MockHost) -> ResourceLoaderContext {
    return ResourceLoaderContext {
        spawn: host.spawn(),
        timers: host.timers(),
    };
}

pub(crate) fn options() -> ResourceLoaderOptions {
    return ResourceLoaderOptions::default();
}

pub(crate) fn loader(
    host: &MockHost,
    settings: Option<ResourceLoaderOptions>,
) -> Ref<ResourceLoader> {
    let settings = settings.map(|settings| Arc::new(RwLock::new(settings)));
    return create_resource_loader(settings.as_ref(), &context(host));
}

pub(crate) fn descriptor<T>(
    key: &str,
    load: Arc<
        dyn Fn(flight_stream::AbortSignal, ResourceLoadBytesReporter) -> ResourceLoadFuture<T>
            + Send
            + Sync,
    >,
) -> ResourceLoadItem<T> {
    return ResourceLoadItem {
        bytes_hint: None,
        group: None,
        key: Some(key.to_string()),
        load,
        on_bytes_progress: None,
        priority: None,
        retries: None,
        timeout_ms: None,
        weight: None,
    };
}

pub(crate) fn item<T: Clone + Send + Sync + 'static>(key: &str, value: T) -> ResourceLoadInput<T> {
    return ResourceLoadInput::Item(descriptor(
        key,
        Arc::new(move |_, _| {
            let value = value.clone();
            Box::pin(async move { Ok(value) })
        }),
    ));
}

pub(crate) fn error(message: &str) -> flight_entity::Unknown {
    return Some(Arc::new(flight_entity::FlightError {
        kind: flight_entity::FlightErrorKind::Error,
        message: message.to_string(),
    }));
}

pub(crate) type Complete = Arc<Mutex<Option<ResourceLoadReports>>>;
pub(crate) fn observe_complete(loader: &Ref<ResourceLoader>) -> Complete {
    let result = Arc::new(Mutex::new(None));
    let captured = result.clone();
    flight_signals::connect_signal(
        &loader.read().unwrap().on_complete,
        Arc::new(move |reports| {
            *captured.lock().unwrap() = Some(reports.clone());
        }),
        None,
    );
    return result;
}

pub(crate) fn reports(complete: &Complete) -> Vec<ResourceLoadReport> {
    return complete
        .lock()
        .unwrap()
        .as_ref()
        .expect("onComplete must have fired")
        .read()
        .unwrap()
        .iter()
        .map(|report| report.read().unwrap().clone())
        .collect();
}

pub(crate) fn handle_result<T: Clone>(
    handle: &Ref<ResourceLoadHandle<T>>,
) -> Option<ResourceLoadResult<T>> {
    return handle.read().unwrap().promise.clone().now_or_never();
}

pub(crate) type Resolver<T> = Arc<dyn Fn(ResourceLoadResult<T>) + Send + Sync>;
pub(crate) fn deferred<T: Clone + Send + Sync + 'static>()
-> (Resolver<T>, SharedFuture<ResourceLoadResult<T>>) {
    let (sender, receiver) = oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let resolve = Arc::new(move |value| {
        let sender = sender.lock().unwrap().take();
        if let Some(sender) = sender {
            let _ = sender.send(value);
        }
    });
    let promise = create_shared_future(Box::pin(async move {
        return match receiver.await {
            Ok(value) => value,
            Err(_) => std::future::pending().await,
        };
    }));
    return (resolve, promise);
}
