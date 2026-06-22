//! Webcam free functions and backend management.

use flighthq_types::{WebcamBackend, WebcamCaptureOptions, WebcamPhoto, WebcamSource, WebcamVideo};
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

/// Builds the default web webcam backend.
///
/// Faithful to the TS `createWebWebcamBackend`, but the box has no DOM substrate
/// (`<input type="file">`, `FileReader`, the Permissions API), so every method
/// resolves to its sentinel: `capture`/`captureVideo` yield `None` and
/// `requestPermission` yields `false`. This is the seam-with-sentinel default a
/// native or web host replaces via [`set_webcam_backend`]; it is not an emulator.
pub fn create_web_webcam_backend() -> Arc<dyn WebcamBackend> {
    Arc::new(WebWebcamBackend)
}

/// Returns the active webcam backend, lazily creating the web default when none
/// has been installed. There is always a backend.
pub fn get_webcam_backend() -> Arc<dyn WebcamBackend> {
    let mut guard = BACKEND.lock().expect("webcam backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(create_web_webcam_backend());
    }
    Arc::clone(guard.as_ref().expect("webcam backend just installed"))
}

/// Picks an existing image from the photo library. Resolves `None` when
/// cancelled or unavailable.
pub async fn pick_webcam_image(options: &WebcamCaptureOptions) -> Option<WebcamPhoto> {
    let merged = with_source(options, WebcamSource::Photos);
    let backend = get_webcam_backend();
    let future = backend.capture(&merged);
    future.await
}

/// Records a video from the device camera. Resolves `None` when cancelled,
/// denied, or unavailable.
pub async fn record_webcam_video(options: &WebcamCaptureOptions) -> Option<WebcamVideo> {
    let merged = with_source(options, WebcamSource::Camera);
    let backend = get_webcam_backend();
    let future = backend.capture_video(&merged);
    future.await
}

/// Requests camera access permission. Resolves `false` when denied or when the
/// host cannot prompt.
pub async fn request_webcam_permission() -> bool {
    let backend = get_webcam_backend();
    let future = backend.request_permission();
    future.await
}

/// Installs a native host webcam backend; pass `None` to fall back to the web
/// default.
pub fn set_webcam_backend(backend: Option<Arc<dyn WebcamBackend>>) {
    let mut guard = BACKEND.lock().expect("webcam backend mutex poisoned");
    *guard = backend;
}

/// Captures a photo from the device camera. Resolves `None` when cancelled,
/// denied, or unavailable.
pub async fn take_webcam_photo(options: &WebcamCaptureOptions) -> Option<WebcamPhoto> {
    let merged = with_source(options, WebcamSource::Camera);
    let backend = get_webcam_backend();
    let future = backend.capture(&merged);
    future.await
}

// Clones the caller options and overrides the capture source, mirroring the TS
// `{ ...options, source }` spread.
fn with_source(options: &WebcamCaptureOptions, source: WebcamSource) -> WebcamCaptureOptions {
    let mut merged = options.clone();
    merged.source = source;
    merged
}

struct WebWebcamBackend;

impl WebcamBackend for WebWebcamBackend {
    fn capture(
        &self,
        _options: &WebcamCaptureOptions,
    ) -> Pin<Box<dyn Future<Output = Option<WebcamPhoto>> + Send>> {
        Box::pin(async { None })
    }

    fn capture_video(
        &self,
        _options: &WebcamCaptureOptions,
    ) -> Pin<Box<dyn Future<Output = Option<WebcamVideo>> + Send>> {
        Box::pin(async { None })
    }

    fn request_permission(&self) -> Pin<Box<dyn Future<Output = bool> + Send>> {
        Box::pin(async { false })
    }
}

static BACKEND: Mutex<Option<Arc<dyn WebcamBackend>>> = Mutex::new(None);

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::sync::Mutex as StdMutex;
    use std::task::{Context, Poll, RawWaker, RawWakerVTable, Waker};

    // Records the options last passed to a capture call, mirroring the TS
    // `fakeBackend` with its `lastOptions` field.
    struct FakeBackend {
        last_options: StdMutex<Option<WebcamCaptureOptions>>,
    }

    impl FakeBackend {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                last_options: StdMutex::new(None),
            })
        }
    }

    impl WebcamBackend for FakeBackend {
        fn capture(
            &self,
            options: &WebcamCaptureOptions,
        ) -> Pin<Box<dyn Future<Output = Option<WebcamPhoto>> + Send>> {
            *self.last_options.lock().unwrap() = Some(options.clone());
            Box::pin(async {
                Some(WebcamPhoto {
                    data_url: "data:image/png;base64,xx".to_string(),
                    width: 0,
                    height: 0,
                    format: "image/png".to_string(),
                })
            })
        }

        fn capture_video(
            &self,
            options: &WebcamCaptureOptions,
        ) -> Pin<Box<dyn Future<Output = Option<WebcamVideo>> + Send>> {
            *self.last_options.lock().unwrap() = Some(options.clone());
            Box::pin(async {
                Some(WebcamVideo {
                    data_url: "data:video/mp4;base64,xx".to_string(),
                    duration: 0.0,
                    format: "video/mp4".to_string(),
                })
            })
        }

        fn request_permission(&self) -> Pin<Box<dyn Future<Output = bool> + Send>> {
            Box::pin(async { true })
        }
    }

    // Minimal synchronous executor for futures that complete without yielding.
    fn block_on<F: Future>(mut future: F) -> F::Output {
        fn raw_waker() -> RawWaker {
            fn no_op(_: *const ()) {}
            fn clone(_: *const ()) -> RawWaker {
                raw_waker()
            }
            RawWaker::new(
                std::ptr::null(),
                &RawWakerVTable::new(clone, no_op, no_op, no_op),
            )
        }
        let waker = unsafe { Waker::from_raw(raw_waker()) };
        let mut cx = Context::from_waker(&waker);
        // Safety: the future is not moved after being pinned.
        let mut future = unsafe { Pin::new_unchecked(&mut future) };
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut cx) {
                return value;
            }
        }
    }

    #[test]
    #[serial]
    fn create_web_webcam_backend_capture_yields_none_without_substrate() {
        // TS asserts capture returns a Promise without throwing; the box has no
        // DOM, so the sentinel default resolves to None.
        let backend = create_web_webcam_backend();
        let options = WebcamCaptureOptions::default();
        assert!(block_on(backend.capture(&options)).is_none());
    }

    #[test]
    #[serial]
    fn get_webcam_backend_falls_back_to_web_backend() {
        set_webcam_backend(None);
        // There is always a backend; permission resolves to the web sentinel.
        let backend = get_webcam_backend();
        assert!(!block_on(backend.request_permission()));
    }

    #[test]
    #[serial]
    fn get_webcam_backend_returns_the_registered_backend() {
        let backend = FakeBackend::new();
        set_webcam_backend(Some(Arc::clone(&backend) as Arc<dyn WebcamBackend>));
        // The registered fake grants permission; the web sentinel would not.
        assert!(block_on(get_webcam_backend().request_permission()));
        set_webcam_backend(None);
    }

    #[test]
    #[serial]
    fn pick_webcam_image_captures_with_the_photos_source() {
        let backend = FakeBackend::new();
        set_webcam_backend(Some(Arc::clone(&backend) as Arc<dyn WebcamBackend>));

        let options = WebcamCaptureOptions {
            quality: Some(0.5),
            ..Default::default()
        };
        let photo = block_on(pick_webcam_image(&options));
        assert!(photo.is_some());

        let guard = backend.last_options.lock().unwrap();
        let last = guard.as_ref().unwrap();
        assert_eq!(last.source, WebcamSource::Photos);
        assert_eq!(last.quality, Some(0.5));

        drop(guard);
        set_webcam_backend(None);
    }

    #[test]
    #[serial]
    fn record_webcam_video_captures_with_the_camera_source() {
        let backend = FakeBackend::new();
        set_webcam_backend(Some(Arc::clone(&backend) as Arc<dyn WebcamBackend>));

        let options = WebcamCaptureOptions {
            max_duration_ms: Some(5000),
            ..Default::default()
        };
        let video = block_on(record_webcam_video(&options));
        assert!(video.is_some());

        let guard = backend.last_options.lock().unwrap();
        let last = guard.as_ref().unwrap();
        assert_eq!(last.source, WebcamSource::Camera);
        assert_eq!(last.max_duration_ms, Some(5000));

        drop(guard);
        set_webcam_backend(None);
    }

    #[test]
    #[serial]
    fn record_webcam_video_web_backend_yields_none() {
        // TS asserts captureVideo returns a Promise without throwing; the box
        // sentinel resolves to None.
        let backend = create_web_webcam_backend();
        let options = WebcamCaptureOptions::default();
        assert!(block_on(backend.capture_video(&options)).is_none());
    }

    #[test]
    #[serial]
    fn request_webcam_permission_delegates_to_the_active_backend() {
        set_webcam_backend(Some(FakeBackend::new() as Arc<dyn WebcamBackend>));
        assert!(block_on(request_webcam_permission()));
        set_webcam_backend(None);
    }

    #[test]
    #[serial]
    fn request_webcam_permission_returns_a_bool_from_the_web_backend() {
        set_webcam_backend(None);
        // The web sentinel cannot prompt, so it resolves to false.
        assert!(!block_on(request_webcam_permission()));
    }

    #[test]
    #[serial]
    fn set_webcam_backend_clears_back_to_the_web_fallback_when_passed_none() {
        set_webcam_backend(Some(FakeBackend::new() as Arc<dyn WebcamBackend>));
        set_webcam_backend(None);
        // Cleared: the active backend is again the web sentinel.
        assert!(!block_on(get_webcam_backend().request_permission()));
        set_webcam_backend(None);
    }

    #[test]
    #[serial]
    fn take_webcam_photo_captures_with_the_camera_source() {
        let backend = FakeBackend::new();
        set_webcam_backend(Some(Arc::clone(&backend) as Arc<dyn WebcamBackend>));

        let options = WebcamCaptureOptions {
            allow_editing: true,
            ..Default::default()
        };
        let photo = block_on(take_webcam_photo(&options));
        assert!(photo.is_some());

        let guard = backend.last_options.lock().unwrap();
        let last = guard.as_ref().unwrap();
        assert_eq!(last.source, WebcamSource::Camera);
        assert!(last.allow_editing);

        drop(guard);
        set_webcam_backend(None);
    }
}
