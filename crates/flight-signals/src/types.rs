use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

/// Type-erased slot function. Slots receive arguments as `Rc<dyn Any>`.
/// Identity is compared via `Rc::ptr_eq`.
pub type SlotFn = Rc<dyn Fn(Rc<dyn Any>)>;

/// A signal that can have slots connected to it.
/// Cloning a Signal creates a shared reference to the same underlying data.
#[derive(Clone)]
pub struct Signal {
    pub data: Rc<RefCell<Option<Rc<RefCell<SignalData>>>>>,
}

impl Default for Signal {
    fn default() -> Self {
        return Signal {
            data: Rc::new(RefCell::new(None)),
        };
    }
}

/// Internal data for an active signal (one with at least one slot connected).
pub struct SignalData {
    pub slots: Vec<Option<SlotFn>>,
    pub priorities: Vec<i32>,
    pub repeat: Vec<bool>,
    pub cancelled: bool,
    pub depth: i32,
}

/// A tracked connection handle returned by connect_signal_tracked.
pub struct SignalConnection {
    pub connected: bool,
    pub paused: bool,
    pub signal: Signal,
    pub slot: SlotFn,
}

/// Reference-counted handle to a SignalConnection.
pub type SignalConnectionHandle = Rc<RefCell<SignalConnection>>;

/// A scope that groups signal connections for bulk disconnect.
/// Cloning creates a shared reference to the same underlying connections list.
#[derive(Clone)]
pub struct SignalScope {
    pub connections: Rc<RefCell<Vec<SignalConnectionHandle>>>,
}

impl Default for SignalScope {
    fn default() -> Self {
        return SignalScope {
            connections: Rc::new(RefCell::new(Vec::new())),
        };
    }
}

/// Options for connect_signal.
#[derive(Clone, Debug, Default)]
pub struct SignalConnectOptions {
    pub priority: i32,
    pub once: bool,
}

/// Options for connect_signal_tracked.
#[derive(Clone, Debug, Default)]
pub struct SignalTrackedConnectOptions {
    pub priority: Option<i32>,
    pub once: bool,
}

/// Options for throttled and debounced signal connections.
#[derive(Clone, Debug, Default)]
pub struct SignalThrottleOptions {
    pub leading: Option<bool>,
    pub trailing: Option<bool>,
}
