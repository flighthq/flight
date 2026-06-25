//! IPC free functions and backend management.
//!
//! Free functions delegate to the active [`IpcBackend`]. The default stub is a
//! no-op (no main process): `send_ipc_message` does nothing, `invoke_ipc`
//! resolves to `None`, and `on_ipc_message` returns an inert unsubscribe. A
//! native host installs a real backend via [`set_ipc_backend`].
//!
//! Channel-resolution note: TS functions accept `string | IpcChannel`; the Rust
//! ports take `&str`, and an [`IpcChannel`] descriptor's `name` field is passed
//! directly (`&channel.name`). This is the mechanical TS↔Rust seam difference,
//! not a behavioral one.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use flighthq_signals::emit_signal;
use flighthq_types::platform::{IpcInvokeHandler, IpcValue};

/// The unsubscribe thunk every `on_ipc_*` returns: call it once to drop the listener.
type IpcUnsubscribe = Box<dyn Fn() + Send + Sync>;
use flighthq_types::{
    IpcBackend, IpcChannel, IpcMessageEvent, IpcSignals, IpcTarget, IpcTimeoutError,
};

// ---------------------------------------------------------------------------
// Default stub backend
// ---------------------------------------------------------------------------

struct StubIpcBackend;

impl IpcBackend for StubIpcBackend {
    fn send(&self, _channel: &str, _args: &[IpcValue]) {
        // No main process on native without a host; fire and forget.
    }

    fn invoke(
        &self,
        _channel: &str,
        _args: &[IpcValue],
    ) -> Pin<Box<dyn Future<Output = Option<IpcValue>> + Send>> {
        Box::pin(async { None })
    }

    fn subscribe(
        &self,
        _channel: &str,
        _listener: Box<dyn Fn(Vec<IpcValue>) + Send + Sync>,
    ) -> IpcUnsubscribe {
        Box::new(|| {})
    }
}

// ---------------------------------------------------------------------------
// Channel descriptor
// ---------------------------------------------------------------------------

/// Creates a typed channel descriptor. Functions take a channel `&str`; an
/// `IpcChannel`'s `name` field is passed where a descriptor is wanted.
pub fn create_ipc_channel(name: &str) -> IpcChannel {
    IpcChannel {
        name: name.to_string(),
    }
}

// ---------------------------------------------------------------------------
// IpcSignals (opt-in)
// ---------------------------------------------------------------------------

/// Activates the optional IpcSignals group and returns it. Calling this is when
/// the cost is assumed. The signals share one underlying emitter for the
/// lifetime of the package; calling `enable_ipc_signals` repeatedly returns a
/// clone of the same group (same emitters).
pub fn enable_ipc_signals() -> IpcSignals {
    let mut guard = SIGNALS.lock().expect("ipc signals mutex poisoned");
    if guard.is_none() {
        *guard = Some(IpcSignals::default());
    }
    guard.as_ref().unwrap().clone()
}

/// Returns the active IpcSignals group, or `None` when `enable_ipc_signals` has
/// not been called.
pub fn get_ipc_signals() -> Option<IpcSignals> {
    SIGNALS
        .lock()
        .expect("ipc signals mutex poisoned")
        .as_ref()
        .cloned()
}

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/// Returns the active IPC backend. Falls back to the no-op stub when no backend
/// has been installed.
pub fn get_ipc_backend() -> Arc<dyn IpcBackend> {
    let guard = BACKEND.lock().expect("ipc backend mutex poisoned");
    match guard.as_ref() {
        Some(b) => Arc::clone(b),
        None => Arc::new(StubIpcBackend),
    }
}

/// Returns the count of active in-package listeners on `channel`. Returns 0 for
/// an unknown channel.
pub fn get_ipc_listener_count(channel: &str) -> usize {
    LISTENERS
        .lock()
        .expect("ipc listeners mutex poisoned")
        .get(channel)
        .map(|set| set.len())
        .unwrap_or(0)
}

/// Returns `true` when a real native backend is installed, `false` when the lazy
/// stub default is active. Distinguishes "no main process" from a connected host
/// without performing an invoke.
pub fn has_ipc_backend() -> bool {
    BACKEND
        .lock()
        .expect("ipc backend mutex poisoned")
        .is_some()
}

/// Installs a native host IPC backend. Pass `None` to fall back to the built-in
/// no-op stub. Fires `on_backend_changed` when IpcSignals are enabled.
pub fn set_ipc_backend(backend: Option<Arc<dyn IpcBackend>>) {
    {
        let mut guard = BACKEND.lock().expect("ipc backend mutex poisoned");
        *guard = backend;
    }
    if let Some(signals) = get_ipc_signals() {
        emit_signal(&signals.on_backend_changed, &());
    }
}

// ---------------------------------------------------------------------------
// Send / invoke
// ---------------------------------------------------------------------------

/// Sends a request on `channel` and resolves with the host's response, or `None`
/// when no backend is installed.
pub async fn invoke_ipc(channel: &str, args: &[IpcValue]) -> Option<IpcValue> {
    get_ipc_backend().invoke(channel, args).await
}

/// Sends a request on `channel` and resolves with the host's response, or returns
/// `Err(IpcTimeoutError)` if the invoke does not complete within `timeout_ms`
/// milliseconds. Requires a tokio runtime to await.
pub async fn invoke_ipc_with_timeout(
    channel: &str,
    timeout_ms: u64,
    args: &[IpcValue],
) -> Result<Option<IpcValue>, IpcTimeoutError> {
    let invoke = get_ipc_backend().invoke(channel, args);
    match tokio::time::timeout(Duration::from_millis(timeout_ms), invoke).await {
        Ok(value) => Ok(value),
        Err(_) => Err(IpcTimeoutError::new(channel, timeout_ms)),
    }
}

/// Registers a responder for `invoke_ipc` calls on `channel`. Returns an
/// unregister thunk. When the active backend does not support handling, returns
/// an inert no-op unsubscribe.
pub fn on_ipc_invoke(channel: &str, handler: IpcInvokeHandler) -> IpcUnsubscribe {
    match get_ipc_backend().handle(channel, handler) {
        Some(off) => off,
        None => Box::new(|| {}),
    }
}

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

/// Subscribes `listener` to a single message on `channel`, then auto-unsubscribes.
/// Returns an unsubscribe thunk for the not-yet-fired case.
pub fn once_ipc_message(
    channel: &str,
    listener: Box<dyn Fn(Vec<IpcValue>) + Send + Sync>,
) -> IpcUnsubscribe {
    // The unsubscribe thunk is shared into the wrapping listener so the first
    // delivery can disconnect before invoking the user listener.
    let slot: Arc<Mutex<Option<IpcUnsubscribe>>> = Arc::new(Mutex::new(None));
    let slot_inner = Arc::clone(&slot);
    let off = on_ipc_message(
        channel,
        Box::new(move |args| {
            if let Some(off) = slot_inner.lock().expect("ipc once slot poisoned").take() {
                off();
            }
            listener(args);
        }),
    );
    *slot.lock().expect("ipc once slot poisoned") = Some(off);

    Box::new(move || {
        if let Some(off) = slot.lock().expect("ipc once slot poisoned").take() {
            off();
        }
    })
}

/// Subscribes `listener` to messages on `channel`; returns an unsubscribe
/// function. Incoming args are passed to the listener as a `Vec`, mirroring
/// `send_ipc_message`'s variadic shape.
pub fn on_ipc_message(
    channel: &str,
    listener: Box<dyn Fn(Vec<IpcValue>) + Send + Sync>,
) -> IpcUnsubscribe {
    let name = channel.to_string();
    let signals = get_ipc_signals();
    let emit_name = name.clone();

    let unsubscribe = get_ipc_backend().subscribe(
        &name,
        Box::new(move |args| {
            if let Some(signals) = &signals {
                emit_signal(&signals.on_channel_message, &emit_name);
            }
            listener(args);
        }),
    );

    track_and_wrap(name, unsubscribe)
}

/// Subscribes `listener` to messages on `channel`, delivering an
/// [`IpcMessageEvent`] with channel, sender id (`-1`), args, and a reply thunk.
/// The args-spread `on_ipc_message` path stays untouched.
pub fn on_ipc_message_event(
    channel: &str,
    listener: Box<dyn Fn(IpcMessageEvent) + Send + Sync>,
) -> IpcUnsubscribe {
    let name = channel.to_string();
    let signals = get_ipc_signals();
    let emit_name = name.clone();
    let reply_name = name.clone();

    let unsubscribe = get_ipc_backend().subscribe(
        &name,
        Box::new(move |args| {
            if let Some(signals) = &signals {
                emit_signal(&signals.on_channel_message, &emit_name);
            }
            let sender_id: i64 = -1;
            let reply_channel = reply_name.clone();
            let event = IpcMessageEvent {
                channel: reply_name.clone(),
                sender_id,
                args,
                reply: Box::new(move |reply_args: &[IpcValue]| {
                    // No-op when sender id is unknown (-1).
                    if sender_id == -1 {
                        return;
                    }
                    get_ipc_backend().send_to(
                        &IpcTarget {
                            window_id: sender_id,
                        },
                        &reply_channel,
                        reply_args,
                    );
                }),
            };
            listener(event);
        }),
    );

    track_and_wrap(name, unsubscribe)
}

/// Drops every in-package listener for `channel`.
pub fn remove_all_ipc_listeners(channel: &str) {
    let thunks: Vec<IpcUnsubscribe> = {
        let mut guard = LISTENERS.lock().expect("ipc listeners mutex poisoned");
        match guard.remove(channel) {
            Some(set) => set.into_iter().map(|(_, off)| off).collect(),
            None => Vec::new(),
        }
    };
    for off in thunks {
        off();
    }
}

/// Drops every in-package listener for all channels.
pub fn remove_all_ipc_listeners_for_all_channels() {
    let thunks: Vec<IpcUnsubscribe> = {
        let mut guard = LISTENERS.lock().expect("ipc listeners mutex poisoned");
        let drained: HashMap<String, Vec<(u64, IpcUnsubscribe)>> = std::mem::take(&mut *guard);
        drained
            .into_values()
            .flat_map(|set| set.into_iter().map(|(_, off)| off))
            .collect()
    };
    for off in thunks {
        off();
    }
}

// ---------------------------------------------------------------------------
// Send variants
// ---------------------------------------------------------------------------

/// Sends a fire-and-forget message on `channel`. No-ops on the stub default (no
/// main process).
pub fn send_ipc_message(channel: &str, args: &[IpcValue]) {
    get_ipc_backend().send(channel, args);
}

/// Sends a fire-and-forget message to a specific `target` window/process.
/// No-ops when the backend does not support targeted send.
pub fn send_ipc_message_to(target: &IpcTarget, channel: &str, args: &[IpcValue]) {
    get_ipc_backend().send_to(target, channel, args);
}

// ---------------------------------------------------------------------------
// Listener registry helpers
// ---------------------------------------------------------------------------

// Registers `unsubscribe` under `channel` and returns a tracked unsubscribe that
// also untracks the registry entry — mirroring the TS `tracked` closure.
fn track_and_wrap(name: String, unsubscribe: IpcUnsubscribe) -> IpcUnsubscribe {
    let id = NEXT_LISTENER_ID.fetch_add(1, Ordering::Relaxed);
    {
        let mut guard = LISTENERS.lock().expect("ipc listeners mutex poisoned");
        guard
            .entry(name.clone())
            .or_default()
            .push((id, unsubscribe));
    }

    Box::new(move || {
        let removed = {
            let mut guard = LISTENERS.lock().expect("ipc listeners mutex poisoned");
            let mut taken = None;
            if let Some(set) = guard.get_mut(&name) {
                if let Some(pos) = set.iter().position(|(entry_id, _)| *entry_id == id) {
                    taken = Some(set.remove(pos).1);
                }
                if set.is_empty() {
                    guard.remove(&name);
                }
            }
            taken
        };
        if let Some(off) = removed {
            off();
        }
    })
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn IpcBackend>>> = Mutex::new(None);
static SIGNALS: Mutex<Option<IpcSignals>> = Mutex::new(None);
#[allow(clippy::type_complexity)]
static LISTENERS: LazyLock<Mutex<HashMap<String, Vec<(u64, IpcUnsubscribe)>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_LISTENER_ID: AtomicU64 = AtomicU64::new(0);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::{SignalConnectOptions, connect_signal};
    use serial_test::serial;
    use std::sync::atomic::{AtomicUsize, Ordering as AtomicOrdering};

    type ListenerMap = HashMap<String, Vec<(u64, Arc<dyn Fn(Vec<IpcValue>) + Send + Sync>)>>;

    // A configurable fake backend that records sends and fires subscribers on demand.
    // Shared registries are `Arc<Mutex<_>>` so unsubscribe thunks can capture a clone
    // (Send + Sync) rather than a raw pointer back into the backend.
    struct FakeIpcBackend {
        sent: Arc<Mutex<Vec<(String, usize)>>>,
        sent_to: Arc<Mutex<Vec<(i64, String, usize)>>>,
        result: Mutex<Option<u32>>,
        listeners: Arc<Mutex<ListenerMap>>,
        handlers: Arc<Mutex<Vec<String>>>,
        next_id: AtomicU64,
        can_handle: bool,
        can_target: bool,
        invoke_hangs: bool,
    }

    impl FakeIpcBackend {
        fn new() -> Arc<Self> {
            Self::with(true, true, false)
        }

        fn with(can_handle: bool, can_target: bool, invoke_hangs: bool) -> Arc<Self> {
            Arc::new(Self {
                sent: Arc::new(Mutex::new(Vec::new())),
                sent_to: Arc::new(Mutex::new(Vec::new())),
                result: Mutex::new(None),
                listeners: Arc::new(Mutex::new(HashMap::new())),
                handlers: Arc::new(Mutex::new(Vec::new())),
                next_id: AtomicU64::new(0),
                can_handle,
                can_target,
                invoke_hangs,
            })
        }

        fn fire(&self, channel: &str, _args: Vec<IpcValue>) {
            let snapshot: Vec<Arc<dyn Fn(Vec<IpcValue>) + Send + Sync>> = self
                .listeners
                .lock()
                .unwrap()
                .get(channel)
                .map(|v| v.iter().map(|(_, l)| Arc::clone(l)).collect())
                .unwrap_or_default();
            for listener in snapshot {
                // Each listener gets its own fresh arg Vec; assertions check shape, not
                // payload identity, so re-boxing the simple test values is unnecessary.
                listener(Vec::new());
            }
        }
    }

    impl IpcBackend for FakeIpcBackend {
        fn send(&self, channel: &str, args: &[IpcValue]) {
            self.sent
                .lock()
                .unwrap()
                .push((channel.to_string(), args.len()));
        }

        fn invoke(
            &self,
            _channel: &str,
            _args: &[IpcValue],
        ) -> Pin<Box<dyn Future<Output = Option<IpcValue>> + Send>> {
            if self.invoke_hangs {
                return Box::pin(std::future::pending());
            }
            let result = *self.result.lock().unwrap();
            Box::pin(async move {
                result.map(|v| {
                    let boxed: IpcValue = Box::new(v);
                    boxed
                })
            })
        }

        fn subscribe(
            &self,
            channel: &str,
            listener: Box<dyn Fn(Vec<IpcValue>) + Send + Sync>,
        ) -> IpcUnsubscribe {
            let id = self.next_id.fetch_add(1, Ordering::Relaxed);
            let arc: Arc<dyn Fn(Vec<IpcValue>) + Send + Sync> = Arc::from(listener);
            self.listeners
                .lock()
                .unwrap()
                .entry(channel.to_string())
                .or_default()
                .push((id, arc));
            let listeners = Arc::clone(&self.listeners);
            let channel = channel.to_string();
            Box::new(move || {
                if let Some(set) = listeners.lock().unwrap().get_mut(&channel) {
                    set.retain(|(entry_id, _)| *entry_id != id);
                }
            })
        }

        fn handle(&self, channel: &str, _handler: IpcInvokeHandler) -> Option<IpcUnsubscribe> {
            if !self.can_handle {
                return None;
            }
            self.handlers.lock().unwrap().push(channel.to_string());
            let handlers = Arc::clone(&self.handlers);
            let channel = channel.to_string();
            Some(Box::new(move || {
                handlers.lock().unwrap().retain(|c| c != &channel);
            }))
        }

        fn send_to(&self, target: &IpcTarget, channel: &str, args: &[IpcValue]) {
            self.sent_to
                .lock()
                .unwrap()
                .push((target.window_id, channel.to_string(), args.len()));
        }

        fn get_capabilities(&self) -> flighthq_types::IpcBackendCapabilities {
            flighthq_types::IpcBackendCapabilities {
                can_handle: self.can_handle,
                can_invoke: true,
                can_send: true,
                can_target: self.can_target,
            }
        }
    }

    fn reset() {
        set_ipc_backend(None);
        remove_all_ipc_listeners_for_all_channels();
        *SIGNALS.lock().unwrap() = None;
    }

    // --- create_ipc_channel ---

    #[test]
    #[serial]
    fn create_ipc_channel_returns_descriptor_with_name() {
        reset();
        let ch = create_ipc_channel("events.ready");
        assert_eq!(ch.name, "events.ready");
    }

    #[test]
    #[serial]
    fn create_ipc_channel_descriptor_accepted_by_send() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let ch = create_ipc_channel("log");
        send_ipc_message(&ch.name, &[Box::new("hello") as IpcValue]);
        let sent = backend.sent.lock().unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].0, "log");
        reset();
    }

    // --- create_web_ipc_backend / capabilities (default stub) ---

    #[test]
    #[serial]
    fn stub_reports_all_capabilities_false() {
        reset();
        let caps = StubIpcBackend.get_capabilities();
        assert!(!caps.can_send);
        assert!(!caps.can_invoke);
        assert!(!caps.can_handle);
        assert!(!caps.can_target);
    }

    // --- enable_ipc_signals ---

    #[test]
    #[serial]
    fn enable_ipc_signals_returns_group() {
        reset();
        let signals = enable_ipc_signals();
        // Connecting proves the signals are live emitters.
        let _g = connect_signal(
            &signals.on_backend_changed,
            Arc::new(|_: &()| {}),
            SignalConnectOptions::default(),
        );
    }

    #[test]
    #[serial]
    fn enable_ipc_signals_returns_same_emitters_on_repeat() {
        reset();
        let a = enable_ipc_signals();
        let b = enable_ipc_signals();
        // Same underlying emitter: a slot connected on `a` is visible on `b`.
        let g = connect_signal(
            &a.on_backend_changed,
            Arc::new(|_: &()| {}),
            SignalConnectOptions::default(),
        );
        assert!(b.on_backend_changed.has_listeners());
        drop(g);
    }

    #[test]
    #[serial]
    fn enable_ipc_signals_fires_backend_changed_on_set() {
        reset();
        let signals = enable_ipc_signals();
        let count = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&count);
        let _g = connect_signal(
            &signals.on_backend_changed,
            Arc::new(move |_: &()| {
                c.fetch_add(1, AtomicOrdering::Relaxed);
            }),
            SignalConnectOptions::default(),
        );
        set_ipc_backend(Some(FakeIpcBackend::new() as Arc<dyn IpcBackend>));
        assert_eq!(count.load(AtomicOrdering::Relaxed), 1);
        set_ipc_backend(None);
        assert_eq!(count.load(AtomicOrdering::Relaxed), 2);
        reset();
    }

    #[test]
    #[serial]
    fn enable_ipc_signals_fires_channel_message_on_receive() {
        reset();
        let signals = enable_ipc_signals();
        let channels = Arc::new(Mutex::new(Vec::<String>::new()));
        let c = Arc::clone(&channels);
        let _g = connect_signal(
            &signals.on_channel_message,
            Arc::new(move |ch: &String| c.lock().unwrap().push(ch.clone())),
            SignalConnectOptions::default(),
        );
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let _off = on_ipc_message("events", Box::new(|_| {}));
        backend.fire("events", Vec::new());
        assert_eq!(*channels.lock().unwrap(), vec!["events".to_string()]);
        reset();
    }

    // --- get_ipc_backend ---

    #[test]
    #[serial]
    fn get_ipc_backend_returns_stub_when_unset() {
        reset();
        let _b = get_ipc_backend();
    }

    // --- get_ipc_listener_count ---

    #[test]
    #[serial]
    fn get_ipc_listener_count_zero_for_unknown_channel() {
        reset();
        assert_eq!(get_ipc_listener_count("never"), 0);
    }

    #[test]
    #[serial]
    fn get_ipc_listener_count_increments_and_decrements() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let off1 = on_ipc_message("ch", Box::new(|_| {}));
        let _off2 = on_ipc_message("ch", Box::new(|_| {}));
        assert_eq!(get_ipc_listener_count("ch"), 2);
        off1();
        assert_eq!(get_ipc_listener_count("ch"), 1);
        reset();
    }

    // --- get_ipc_signals ---

    #[test]
    #[serial]
    fn get_ipc_signals_none_before_enable() {
        reset();
        assert!(get_ipc_signals().is_none());
    }

    #[test]
    #[serial]
    fn get_ipc_signals_some_after_enable() {
        reset();
        let _signals = enable_ipc_signals();
        assert!(get_ipc_signals().is_some());
        reset();
    }

    // --- has_ipc_backend ---

    #[test]
    #[serial]
    fn has_ipc_backend_false_before_set() {
        reset();
        assert!(!has_ipc_backend());
    }

    #[test]
    #[serial]
    fn has_ipc_backend_true_after_native_and_false_after_null() {
        reset();
        set_ipc_backend(Some(FakeIpcBackend::new() as Arc<dyn IpcBackend>));
        assert!(has_ipc_backend());
        set_ipc_backend(None);
        assert!(!has_ipc_backend());
    }

    // --- invoke_ipc ---

    #[test]
    #[serial]
    fn invoke_ipc_resolves_backend_result() {
        reset();
        let backend = FakeIpcBackend::new();
        *backend.result.lock().unwrap() = Some(42);
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let out = pollster::block_on(invoke_ipc("compute", &[]));
        assert_eq!(*out.unwrap().downcast::<u32>().unwrap(), 42);
        reset();
    }

    // --- invoke_ipc_with_timeout ---

    #[tokio::test]
    #[serial]
    async fn invoke_ipc_with_timeout_resolves_before_timeout() {
        reset();
        let backend = FakeIpcBackend::new();
        *backend.result.lock().unwrap() = Some(99);
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let out = invoke_ipc_with_timeout("cmd", 1000, &[]).await.unwrap();
        assert_eq!(*out.unwrap().downcast::<u32>().unwrap(), 99);
        reset();
    }

    #[tokio::test]
    #[serial]
    async fn invoke_ipc_with_timeout_rejects_on_timeout() {
        reset();
        let backend = FakeIpcBackend::with(true, true, true);
        set_ipc_backend(Some(backend as Arc<dyn IpcBackend>));
        let err = invoke_ipc_with_timeout("slow-channel", 5, &[])
            .await
            .unwrap_err();
        assert_eq!(err.channel, "slow-channel");
        assert_eq!(err.timeout_ms, 5);
        reset();
    }

    // --- on_ipc_invoke ---

    #[test]
    #[serial]
    fn on_ipc_invoke_registers_handler_via_backend() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let _off = on_ipc_invoke("compute", Box::new(|_| None));
        assert!(
            backend
                .handlers
                .lock()
                .unwrap()
                .contains(&"compute".to_string())
        );
        reset();
    }

    #[test]
    #[serial]
    fn on_ipc_invoke_inert_when_backend_has_no_handle() {
        reset();
        let backend = FakeIpcBackend::with(false, true, false);
        set_ipc_backend(Some(backend as Arc<dyn IpcBackend>));
        let off = on_ipc_invoke("compute", Box::new(|_| None));
        off(); // Must not panic.
        reset();
    }

    #[test]
    #[serial]
    fn on_ipc_invoke_unregisters_on_unsubscribe() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let off = on_ipc_invoke("compute", Box::new(|_| None));
        off();
        assert!(
            !backend
                .handlers
                .lock()
                .unwrap()
                .contains(&"compute".to_string())
        );
        reset();
    }

    // --- on_ipc_message ---

    #[test]
    #[serial]
    fn on_ipc_message_tracks_listener_count() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        assert_eq!(get_ipc_listener_count("evt"), 0);
        let off = on_ipc_message("evt", Box::new(|_| {}));
        assert_eq!(get_ipc_listener_count("evt"), 1);
        off();
        assert_eq!(get_ipc_listener_count("evt"), 0);
        reset();
    }

    // --- on_ipc_message_event ---

    #[test]
    #[serial]
    fn on_ipc_message_event_delivers_event_with_sender_minus_one() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let captured = Arc::new(Mutex::new(Vec::<(String, i64)>::new()));
        let c = Arc::clone(&captured);
        let off = on_ipc_message_event(
            "ch",
            Box::new(move |ev| c.lock().unwrap().push((ev.channel.clone(), ev.sender_id))),
        );
        backend.fire("ch", Vec::new());
        assert_eq!(*captured.lock().unwrap(), vec![("ch".to_string(), -1)]);
        off();
        reset();
    }

    #[test]
    #[serial]
    fn on_ipc_message_event_reply_is_noop_when_sender_minus_one() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let off = on_ipc_message_event("ch", Box::new(|ev| (ev.reply)(&[])));
        backend.fire("ch", Vec::new());
        // No targeted send since sender id is -1.
        assert!(backend.sent_to.lock().unwrap().is_empty());
        off();
        reset();
    }

    #[test]
    #[serial]
    fn on_ipc_message_event_tracks_listener_count() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let off = on_ipc_message_event("ch2", Box::new(|_| {}));
        assert_eq!(get_ipc_listener_count("ch2"), 1);
        off();
        assert_eq!(get_ipc_listener_count("ch2"), 0);
        reset();
    }

    // --- once_ipc_message ---

    #[test]
    #[serial]
    fn once_ipc_message_auto_unsubscribes_after_first() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let count = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&count);
        let _off = once_ipc_message(
            "ping",
            Box::new(move |_| {
                c.fetch_add(1, AtomicOrdering::Relaxed);
            }),
        );
        backend.fire("ping", Vec::new());
        backend.fire("ping", Vec::new());
        assert_eq!(count.load(AtomicOrdering::Relaxed), 1);
        reset();
    }

    #[test]
    #[serial]
    fn once_ipc_message_manual_unsubscribe_before_fire() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let count = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&count);
        let off = once_ipc_message(
            "ping",
            Box::new(move |_| {
                c.fetch_add(1, AtomicOrdering::Relaxed);
            }),
        );
        off();
        backend.fire("ping", Vec::new());
        assert_eq!(count.load(AtomicOrdering::Relaxed), 0);
        reset();
    }

    // --- remove_all_ipc_listeners ---

    #[test]
    #[serial]
    fn remove_all_ipc_listeners_for_specific_channel() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let _a1 = on_ipc_message("a", Box::new(|_| {}));
        let _a2 = on_ipc_message("a", Box::new(|_| {}));
        let _b1 = on_ipc_message("b", Box::new(|_| {}));
        remove_all_ipc_listeners("a");
        assert_eq!(get_ipc_listener_count("a"), 0);
        assert_eq!(get_ipc_listener_count("b"), 1);
        reset();
    }

    #[test]
    #[serial]
    fn remove_all_ipc_listeners_for_all_channels_clears_everything() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        let _a = on_ipc_message("a", Box::new(|_| {}));
        let _b = on_ipc_message("b", Box::new(|_| {}));
        remove_all_ipc_listeners_for_all_channels();
        assert_eq!(get_ipc_listener_count("a"), 0);
        assert_eq!(get_ipc_listener_count("b"), 0);
        reset();
    }

    // --- send_ipc_message ---

    #[test]
    #[serial]
    fn send_ipc_message_forwards_to_backend() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        send_ipc_message("log", &[Box::new(1u32) as IpcValue]);
        let sent = backend.sent.lock().unwrap();
        assert_eq!(sent[0].0, "log");
        reset();
    }

    #[test]
    #[serial]
    fn send_ipc_message_does_not_panic_with_stub() {
        reset();
        send_ipc_message("test-channel", &[]);
    }

    // --- send_ipc_message_to ---

    #[test]
    #[serial]
    fn send_ipc_message_to_forwards_target_channel_args() {
        reset();
        let backend = FakeIpcBackend::new();
        set_ipc_backend(Some(Arc::clone(&backend) as Arc<dyn IpcBackend>));
        send_ipc_message_to(
            &IpcTarget { window_id: 3 },
            "log",
            &[Box::new("hello") as IpcValue],
        );
        let sent_to = backend.sent_to.lock().unwrap();
        assert_eq!(sent_to.len(), 1);
        assert_eq!(sent_to[0].0, 3);
        assert_eq!(sent_to[0].1, "log");
        assert_eq!(sent_to[0].2, 1);
        reset();
    }

    #[test]
    #[serial]
    fn send_ipc_message_to_noop_with_stub() {
        reset();
        // Stub default does not implement send_to; must not panic.
        send_ipc_message_to(&IpcTarget { window_id: 1 }, "log", &[]);
    }

    // --- set_ipc_backend ---

    #[test]
    #[serial]
    fn set_ipc_backend_installs_backend() {
        reset();
        set_ipc_backend(Some(FakeIpcBackend::new() as Arc<dyn IpcBackend>));
        let _b = get_ipc_backend();
        reset();
    }
}
