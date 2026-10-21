use crate::mock_host::MockHost;
use flight_assets::contract::*;
use flight_entity::{FlightError, FlightErrorKind, Ref, Unknown};
use flight_loader::{ResourceLoadResult, ResourceLoaderContext};
use flight_stream::{SharedFuture, create_shared_future};
use futures::FutureExt;
use futures::channel::oneshot;
use std::sync::{Arc, Mutex, RwLock};

pub fn context(host: &MockHost) -> ResourceLoaderContext {
    return ResourceLoaderContext {
        spawn: host.spawn(),
        timers: host.timers(),
    };
}
pub fn library(host: &MockHost) -> Ref<AssetLibrary> {
    return create_asset_library(&context(host));
}
pub fn descriptor(id: &str, groups: &[&str]) -> Ref<AssetDescriptor> {
    return Arc::new(RwLock::new(AssetDescriptor {
        id: id.to_string(),
        url: format!("{id}.bin"),
        r#type: "image".to_string(),
        groups: if groups.is_empty() {
            None
        } else {
            Some(groups.iter().map(|s| s.to_string()).collect())
        },
    }));
}
pub fn failure(message: &str) -> Unknown {
    return Some(Arc::new(FlightError {
        kind: FlightErrorKind::Error,
        message: message.to_string(),
    }));
}
pub fn result<T: Clone>(
    promise: &SharedFuture<ResourceLoadResult<T>>,
) -> Option<ResourceLoadResult<T>> {
    return promise.clone().now_or_never();
}
pub fn error_message(error: &Unknown) -> String {
    return error
        .as_ref()
        .unwrap()
        .downcast_ref::<FlightError>()
        .unwrap()
        .message
        .clone();
}
pub fn deferred<T: Clone + Send + 'static>() -> (
    Arc<dyn Fn(ResourceLoadResult<T>) + Send + Sync>,
    SharedFuture<ResourceLoadResult<T>>,
) {
    let (sender, receiver) = oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let settle = Arc::new(move |value| {
        let sender = sender.lock().unwrap().take();
        if let Some(sender) = sender {
            let _ = sender.send(value);
        }
    });
    return (
        settle,
        create_shared_future(Box::pin(async move {
            match receiver.await {
                Ok(value) => value,
                Err(_) => std::future::pending().await,
            }
        })),
    );
}
#[derive(Clone)]
pub struct MockAdapter {
    pub adapter: Ref<AssetLoaderAdapter<Ref<String>>>,
    pub pending: Arc<Mutex<Vec<Arc<dyn Fn() + Send + Sync>>>>,
    pub values: Arc<Mutex<Vec<Ref<String>>>>,
    pub disposed: Arc<Mutex<Vec<Ref<String>>>>,
    pub calls: Arc<Mutex<usize>>,
    pub active: Arc<Mutex<usize>>,
    pub peak: Arc<Mutex<usize>>,
}
pub fn mock_adapter() -> MockAdapter {
    let pending = Arc::new(Mutex::new(Vec::<Arc<dyn Fn() + Send + Sync>>::new()));
    let values = Arc::new(Mutex::new(Vec::new()));
    let disposed = Arc::new(Mutex::new(Vec::new()));
    let calls = Arc::new(Mutex::new(0));
    let active = Arc::new(Mutex::new(0));
    let peak = Arc::new(Mutex::new(0));
    let queued = pending.clone();
    let count = calls.clone();
    let running = active.clone();
    let maximum = peak.clone();
    let produced = values.clone();
    let load = Arc::new(move |descriptor: &Ref<AssetDescriptor>| {
        *count.lock().unwrap() += 1;
        let current = {
            let mut active = running.lock().unwrap();
            *active += 1;
            *active
        };
        let mut peak = maximum.lock().unwrap();
        *peak = (*peak).max(current);
        drop(peak);
        let value = Arc::new(RwLock::new(descriptor.read().unwrap().id.clone()));
        produced.lock().unwrap().push(value.clone());
        let (settle, future) = deferred();
        let active = running.clone();
        queued.lock().unwrap().push(Arc::new(move || {
            *active.lock().unwrap() -= 1;
            settle(Ok(value.clone()));
        }));
        return Box::pin(future) as flight_loader::ResourceLoadFuture<Ref<String>>;
    });
    let freed = disposed.clone();
    let dispose = Arc::new(move |value| freed.lock().unwrap().push(value));
    return MockAdapter {
        adapter: Arc::new(RwLock::new(AssetLoaderAdapter { load, dispose })),
        pending,
        values,
        disposed,
        calls,
        active,
        peak,
    };
}
pub fn flush(mock: &MockAdapter, host: &MockHost) {
    let wave = std::mem::take(&mut *mock.pending.lock().unwrap());
    for settle in wave {
        settle();
    }
    host.run_ready();
}
pub fn with_asset(host: &MockHost, id: &str) -> (Ref<AssetLibrary>, MockAdapter) {
    let library = library(host);
    let mock = mock_adapter();
    register_asset_loader(&library, "image", &mock.adapter);
    register_asset_descriptor(&library, &descriptor(id, &[]));
    return (library, mock);
}
pub fn acquire(
    library: &Ref<AssetLibrary>,
    id: &str,
) -> SharedFuture<ResourceLoadResult<Ref<String>>> {
    return acquire_asset(library, id);
}
pub fn loaded(library: &Ref<AssetLibrary>, id: &str) -> Option<Ref<String>> {
    return get_asset(library, id);
}
