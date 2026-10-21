use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref};

/// Identity of one slot registration on a `Signal`.
///
/// D4: `connect_signal` returns this handle and `disconnect_signal` takes it. It is an opaque
/// Rust-side handle; it is never transpiled as a TS number.
// flight-lint: allow(contract-vocabulary) D4 SlotId is an opaque registration handle, not payload data
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct SlotId(pub u64);

/// Identity of one pending signal timer, returned by `set_signal_timeout`.
// flight-lint: allow(contract-vocabulary) D5 timer handles are opaque, never transpiled as numbers
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct TimerId(pub u64);

/// The payload of `connect_signal_at_frame_rate`: the accumulated delta time in milliseconds.
// flight-lint: allow(f64) D1: frame deltas are millisecond durations; f32 loses precision in accumulation
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct FrameTick {
    pub delta_time: f64,
}

/// A slot callback, stored or passed by reference (D9d). Shared by the signal rather than cloned
/// per dispatch, so one allocation serves every emission.
pub type SignalSlot<T> = Arc<dyn Fn(&T) + Send + Sync>;

/// One live signal registration. The dispatch arrays keep tombstones for removed entries so an
/// emission that is already walking them never sees an index move under it.
pub struct SignalData<T> {
    pub slots: Vec<Option<SignalSlot<T>>>,
    pub ids: Vec<SlotId>,
    pub priorities: Vec<i32>,
    pub repeat: Vec<bool>,
    pub paused: Vec<bool>,
    pub cancelled: bool,
    pub depth: u32,
}

/// A signal with a typed payload (D4). TS models `Signal<T extends (...args) => void>`; the IR
/// carries the payload instead, and slots receive `&T`.
///
/// Cloning shares the same signal data, matching TS object identity. `next_slot_id` is shared
/// too, so ids stay unique for the lifetime of the signal even across `clear_signal`.
pub struct Signal<T> {
    pub data: Ref<Option<SignalData<T>>>,
    pub(crate) next_slot_id: Arc<AtomicU64>,
    runtime: EntityRuntimeSlot,
}

/// Options for `connect_signal`.
#[derive(Clone, Debug, Default)]
pub struct SignalConnectOptions {
    pub priority: Option<i32>,
    pub once: Option<bool>,
}

/// Options for `connect_signal_tracked`.
#[derive(Clone, Default)]
pub struct SignalTrackedConnectOptions {
    pub priority: Option<i32>,
    pub once: Option<bool>,
    pub scope: Option<SignalScope>,
}

/// Options for throttled and debounced signal connections.
#[derive(Clone, Debug, Default)]
pub struct SignalThrottleOptions {
    pub leading: Option<bool>,
    pub trailing: Option<bool>,
}

/// A handle to one tracked slot registration.
///
/// The fields are opaque: use `is_signal_connection_connected`, `is_signal_connection_paused`,
/// `pause_signal_connection`, `resume_signal_connection` and `disconnect_signal_connection`.
/// The operations are closures so one non-generic handle can live in a `SignalScope`, which
/// holds connections for signals of every payload type.
#[derive(Clone)]
pub struct SignalConnection {
    pub(crate) disconnect: Arc<dyn Fn() + Send + Sync>,
    pub(crate) set_paused: Arc<dyn Fn(bool) + Send + Sync>,
    pub(crate) is_connected: Arc<dyn Fn() -> bool + Send + Sync>,
    pub(crate) paused: Arc<AtomicBool>,
}

/// A collection of tracked connections torn down together.
///
/// Cloning shares the list, matching a TS object reference. The connections vector is shared so
/// a scope can be registered on a connection and then torn down from anywhere.
#[derive(Clone, Default)]
pub struct SignalScope {
    pub connections: Ref<Vec<SignalConnection>>,
    runtime: EntityRuntimeSlot,
}

/// One pending timer callback.
// flight-lint: allow(f64) D1: timers run on millisecond durations shared with the throttles
pub struct SignalTimer {
    pub id: TimerId,
    pub fire_at_ms: f64,
    pub callback: Arc<dyn Fn() + Send + Sync>,
}

/// Explicit timer state for debounced and throttled connections (D5): the caller creates it,
/// injects time through `advance_signal_timers`, and no clock is read inside the contract.
// flight-lint: allow(f64) D1: current time and fire times are millisecond durations
pub struct SignalTimerState {
    pub now_ms: f64,
    pub timers: Vec<SignalTimer>,
    pub(crate) next_id: u64,
}

pub(crate) fn signal_entity_runtime<T>(signal: &Signal<T>) -> &EntityRuntimeSlot {
    return &signal.runtime;
}

pub(crate) fn signal_entity_runtime_mut<T>(signal: &mut Signal<T>) -> &mut EntityRuntimeSlot {
    return &mut signal.runtime;
}

impl Default for SignalTimerState {
    fn default() -> Self {
        return SignalTimerState {
            now_ms: 0.0,
            timers: Vec::new(),
            next_id: 1,
        };
    }
}

impl<T> flight_entity::Entity for Signal<T> {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return signal_entity_runtime(self);
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return signal_entity_runtime_mut(self);
    }
}

flight_entity::impl_entity!(SignalScope);

impl<T> std::fmt::Debug for Signal<T> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        return formatter.write_str("Signal(..)");
    }
}

impl std::fmt::Debug for SignalScope {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        return formatter.write_str("SignalScope(..)");
    }
}

impl<T> Clone for Signal<T> {
    fn clone(&self) -> Self {
        return Signal {
            data: self.data.clone(),
            next_slot_id: self.next_slot_id.clone(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl<T> Default for Signal<T> {
    fn default() -> Self {
        return Signal {
            data: Ref::new(RwLock::new(None)),
            next_slot_id: Arc::new(AtomicU64::new(1)),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}
