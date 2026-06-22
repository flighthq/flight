//! Web storage backend over `window.localStorage`.
//!
//! Of the three async/data web seams, storage is the one that is genuinely
//! synchronous in the browser: `localStorage` blocks. The [`StorageBackend`]
//! seam is `&mut self` + `Send + Sync`, and a zero-sized backend satisfies it —
//! the `web_sys::Storage` handle is fetched fresh inside each call rather than
//! stored, so no non-`Send` JS object is held across the seam.

use flighthq_types::StorageBackend;

/// A [`StorageBackend`] backed by the browser's `window.localStorage`.
///
/// Zero-sized: it holds no JS handle, re-fetching `localStorage` per call.
/// Every method returns the storage seam's documented sentinels when storage is
/// unavailable (e.g. private-mode quota errors, no window): `None` / `false` /
/// `[]`.
#[derive(Clone, Copy, Debug, Default)]
pub struct WebStorageBackend;

/// Allocates a [`WebStorageBackend`].
pub fn create_web_storage_backend() -> WebStorageBackend {
    WebStorageBackend
}

/// Installs the web `localStorage` backend as the active storage backend for the
/// `flighthq-storage` free functions. Call once at host startup.
pub fn set_web_storage_backend() {
    flighthq_storage::set_storage_backend(Box::new(create_web_storage_backend()));
}

#[cfg(target_arch = "wasm32")]
impl StorageBackend for WebStorageBackend {
    fn get_item(&self, key: &str) -> Option<String> {
        local_storage()?.get_item(key).ok().flatten()
    }

    fn set_item(&mut self, key: &str, value: &str) -> bool {
        match local_storage() {
            Some(storage) => storage.set_item(key, value).is_ok(),
            None => false,
        }
    }

    fn remove_item(&mut self, key: &str) -> bool {
        match local_storage() {
            Some(storage) => storage.remove_item(key).is_ok(),
            None => false,
        }
    }

    fn clear(&mut self) -> bool {
        match local_storage() {
            Some(storage) => storage.clear().is_ok(),
            None => false,
        }
    }

    fn keys(&self) -> Vec<String> {
        let Some(storage) = local_storage() else {
            return Vec::new();
        };
        let len = storage.length().unwrap_or(0);
        let mut out = Vec::with_capacity(len as usize);
        for index in 0..len {
            if let Ok(Some(key)) = storage.key(index) {
                out.push(key);
            }
        }
        out
    }
}

// On native targets the backend exists (so `create_web_storage_backend` /
// `set_web_storage_backend` type-check in the workspace build) but has no
// browser storage to talk to and reports the unavailable sentinels.
#[cfg(not(target_arch = "wasm32"))]
impl StorageBackend for WebStorageBackend {
    fn get_item(&self, _key: &str) -> Option<String> {
        None
    }

    fn set_item(&mut self, _key: &str, _value: &str) -> bool {
        false
    }

    fn remove_item(&mut self, _key: &str) -> bool {
        false
    }

    fn clear(&mut self) -> bool {
        false
    }

    fn keys(&self) -> Vec<String> {
        Vec::new()
    }
}

#[cfg(target_arch = "wasm32")]
fn local_storage() -> Option<web_sys::Storage> {
    web_sys::window()?.local_storage().ok().flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_web_storage_backend_is_zero_sized() {
        // A ZST backend is what lets the non-`Send` JS handle stay out of the struct.
        assert_eq!(std::mem::size_of::<WebStorageBackend>(), 0);
    }

    #[cfg(not(target_arch = "wasm32"))]
    #[test]
    fn native_web_storage_backend_reports_unavailable() {
        let mut backend = create_web_storage_backend();
        assert_eq!(backend.get_item("k"), None);
        assert!(!backend.set_item("k", "v"));
        assert!(!backend.remove_item("k"));
        assert!(!backend.clear());
        assert!(backend.keys().is_empty());
    }
}
