//! Transient UI-state bag saved on pause and restored on the next resume.

use std::any::Any;
use std::cell::RefCell;
use std::collections::HashMap;

/// A string-keyed bag of transient UI state. An `on_save_state` listener fills
/// it (via [`set`](AppStateBag::set)) when the app leaves `Active`; the same bag
/// is replayed read-only through `on_restore_state` on the next resume.
///
/// Interior mutability mirrors the TS `Record<string, unknown>` that listeners
/// mutate in place — a `&`-borrow save listener records entries the caller then
/// stores. Values are `Box<dyn Any + Send + Sync>`, the Rust analogue of TS
/// `unknown`.
#[derive(Debug, Default)]
pub struct AppStateBag {
    entries: RefCell<HashMap<String, Box<dyn Any + Send + Sync>>>,
}

impl AppStateBag {
    /// Stores `value` under `key`, replacing any prior value.
    pub fn set(&self, key: &str, value: Box<dyn Any + Send + Sync>) {
        self.entries.borrow_mut().insert(key.to_string(), value);
    }

    /// Returns whether a value is stored under `key`.
    pub fn contains(&self, key: &str) -> bool {
        self.entries.borrow().contains_key(key)
    }

    /// Returns whether the bag holds no entries.
    pub fn is_empty(&self) -> bool {
        self.entries.borrow().is_empty()
    }

    /// Reads the value stored under `key` as `T`, returning `None` when the key
    /// is absent or the stored type does not match.
    pub fn get<T: 'static + Clone>(&self, key: &str) -> Option<T> {
        self.entries
            .borrow()
            .get(key)
            .and_then(|v| v.downcast_ref::<T>())
            .cloned()
    }
}
