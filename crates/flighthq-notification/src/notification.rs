//! Notification free functions and backend management.

use flighthq_types::{NotificationBackend, NotificationRequest};
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/// Returns the active notification backend. Panics if no backend has been set.
/// Callers should ensure [`set_notification_backend`] is called during startup.
pub fn get_notification_backend() -> Arc<dyn NotificationBackend> {
    let guard = BACKEND.lock().expect("notification backend mutex poisoned");
    match guard.as_ref() {
        Some(b) => Arc::clone(b),
        None => {
            panic!("no notification backend installed; call set_notification_backend before use")
        }
    }
}

/// Installs a notification backend. Pass `None` to clear the active backend.
///
/// Typically called once at application startup by a host adapter
/// (e.g. `flighthq-host-electron`).
pub fn set_notification_backend(backend: Option<Arc<dyn NotificationBackend>>) {
    let mut guard = BACKEND.lock().expect("notification backend mutex poisoned");
    *guard = backend;
}

// ---------------------------------------------------------------------------
// Public free functions
// ---------------------------------------------------------------------------

/// Returns `true` when the host can show notifications. Cheap; reads the active backend.
pub fn is_notification_supported() -> bool {
    get_notification_backend().is_supported()
}

/// Subscribes to notification action-button activations, delivering the
/// notification tag and action id. Returns an unsubscribe function.
///
/// On web this never fires (no global action feed); a native host is required.
pub fn on_notification_action(
    listener: Box<dyn Fn(String, String) + Send + Sync>,
) -> Box<dyn Fn() + Send + Sync> {
    get_notification_backend().subscribe_action(listener)
}

/// Subscribes to notification body clicks, delivering the notification tag.
/// Returns an unsubscribe function.
///
/// On web this never fires (clicks are per-instance, not a global feed); a
/// native host is required.
pub fn on_notification_click(
    listener: Box<dyn Fn(String) + Send + Sync>,
) -> Box<dyn Fn() + Send + Sync> {
    get_notification_backend().subscribe_click(listener)
}

/// Requests notification permission from the OS.
/// Returns `false` when denied or the host lacks the surface.
pub async fn request_notification_permission() -> bool {
    get_notification_backend().request_permission().await
}

/// Shows a notification. Returns `false` when permission is not granted or the
/// host lacks the surface.
pub async fn show_notification(request: &NotificationRequest) -> bool {
    get_notification_backend().notify(request).await
}

/// Updates a live notification by id, merging `update` into the existing
/// notification — useful for progress bars and live-content updates. Returns
/// `true` when the update was applied; `false` when the notification is no
/// longer visible or the backend does not support updates.
pub async fn update_notification(id: &str, update: &NotificationRequest) -> bool {
    get_notification_backend()
        .update_notification(id, update)
        .await
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn NotificationBackend>>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    struct StubBackend;

    impl NotificationBackend for StubBackend {
        fn notify(
            &self,
            _request: &NotificationRequest,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { false })
        }
        fn update_notification(
            &self,
            _id: &str,
            _update: &NotificationRequest,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { false })
        }
        fn request_permission(
            &self,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { false })
        }
        fn is_supported(&self) -> bool {
            false
        }
        fn subscribe_click(
            &self,
            _listener: Box<dyn Fn(String) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            Box::new(|| {})
        }
        fn subscribe_action(
            &self,
            _listener: Box<dyn Fn(String, String) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            Box::new(|| {})
        }
    }

    // Records the id passed to update_notification and reports whether it was called.
    struct UpdateRecordingBackend {
        updated_id: Mutex<Option<String>>,
    }

    impl NotificationBackend for UpdateRecordingBackend {
        fn notify(
            &self,
            _request: &NotificationRequest,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { false })
        }
        fn update_notification(
            &self,
            id: &str,
            _update: &NotificationRequest,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            *self.updated_id.lock().unwrap() = Some(id.to_owned());
            Box::pin(async { true })
        }
        fn request_permission(
            &self,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> {
            Box::pin(async { false })
        }
        fn is_supported(&self) -> bool {
            false
        }
        fn subscribe_click(
            &self,
            _listener: Box<dyn Fn(String) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            Box::new(|| {})
        }
        fn subscribe_action(
            &self,
            _listener: Box<dyn Fn(String, String) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            Box::new(|| {})
        }
    }

    #[test]
    #[serial]
    fn set_notification_backend_installs_backend() {
        set_notification_backend(Some(Arc::new(StubBackend)));
        assert!(!is_notification_supported());
        // Clear after test
        set_notification_backend(None);
    }

    // Ports the TS `updateNotification` "delegates to the active backend" assertion:
    // the call reaches the backend with the given id and returns its boolean result.
    #[test]
    #[serial]
    fn update_notification_delegates_to_backend() {
        let backend = Arc::new(UpdateRecordingBackend {
            updated_id: Mutex::new(None),
        });
        set_notification_backend(Some(backend.clone()));
        let applied = pollster::block_on(update_notification(
            "notif-1",
            &NotificationRequest {
                body: Some("Updated body".to_owned()),
                ..Default::default()
            },
        ));
        assert!(applied);
        assert_eq!(
            backend.updated_id.lock().unwrap().as_deref(),
            Some("notif-1")
        );
        set_notification_backend(None);
    }
}
