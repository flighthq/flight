// Fresh caller-owned states per case are the source's beforeEach/afterEach reset (disable, unregister
// the test subsystems, clear sinks and channel levels, global level Verbose).

use std::sync::{Arc, Mutex, RwLock};

use flight_debug::contract::*;
use flight_log::{
    LogEntry, LogLevel, LogStateRef, MemoryLogSink, create_log_state, get_memory_log_sink_entries,
    set_log_level,
};

pub fn states() -> (DebugStateRef, LogStateRef) {
    let log_state: LogStateRef = Arc::new(RwLock::new(create_log_state()));
    set_log_level(&log_state, LogLevel::Verbose);
    return (Arc::new(RwLock::new(create_debug_state())), log_state);
}

pub fn entries(sink: &MemoryLogSink) -> Vec<LogEntry> {
    let mut out = Vec::new();
    get_memory_log_sink_entries(&mut out, sink);
    return out;
}

pub fn options(sink: &Arc<dyn Fn(&LogEntry) + Send + Sync>) -> DebugOptions {
    return DebugOptions {
        channels: None,
        level: None,
        sink: Some(sink.clone()),
        subsystems: None,
    };
}

pub fn subsystems(names: &[&str]) -> Option<Vec<String>> {
    return Some(names.iter().map(|name| name.to_string()).collect());
}

pub fn hooks(
    channels: &[&str],
    enable_guards: Option<Arc<dyn Fn() + Send + Sync>>,
    disable_guards: Option<Arc<dyn Fn() + Send + Sync>>,
) -> DebugSubsystemHooks {
    return DebugSubsystemHooks {
        channels: if channels.is_empty() {
            None
        } else {
            Some(channels.iter().map(|channel| channel.to_string()).collect())
        },
        disable_guards,
        enable_guards,
    };
}

// The source's `vi.fn()`: a binding and its call count.
pub fn counted() -> (Arc<dyn Fn() + Send + Sync>, Arc<Mutex<usize>>) {
    let calls = Arc::new(Mutex::new(0));
    let counter = calls.clone();
    let binding: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
        *counter.lock().unwrap() += 1;
    });
    return (binding, calls);
}

pub fn calls(count: &Arc<Mutex<usize>>) -> usize {
    return *count.lock().unwrap();
}
