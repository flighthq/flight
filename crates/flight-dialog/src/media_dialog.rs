use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::future::Future;
    use std::sync::Arc;
    use std::task::{Context, Poll, Waker};

    use super::*;

    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
        }
    }

    fn ok<T: Send + 'static>(value: T) -> DialogProviderFuture<T> {
        return Box::pin(std::future::ready(Ok(value)));
    }

    #[test]
    fn host_image_open_dialog_capability_show_open_image_dialog_matches_show_open_image_dialog() {
        let host = HostImageOpenDialogCapability {
            provider: Arc::new(()),
            open: Arc::new(|options: Option<&OpenImageDialogOptions>| {
                ok(if options.is_some() {
                    ImageOpenDialogResult::ImageOpenFailed
                } else {
                    ImageOpenDialogResult::Cancelled
                })
            }),
        };
        let options = OpenImageDialogOptions::default();
        assert_eq!(
            block_on(host.show_open_image_dialog(Some(&options))).unwrap(),
            block_on(show_open_image_dialog(&host, Some(&options))).unwrap()
        );
        assert_eq!(
            block_on(host.show_open_image_dialog(None)).unwrap(),
            ImageOpenDialogResult::Cancelled
        );
    }

    #[test]
    fn host_photo_capture_dialog_capability_show_capture_photo_dialog_matches_show_capture_photo_dialog()
     {
        let host = HostPhotoCaptureDialogCapability {
            provider: Arc::new(()),
            capture: Arc::new(|options: Option<&CapturePhotoDialogOptions>| {
                ok(if options.is_some() {
                    PhotoCaptureDialogResult::SecurityDenied
                } else {
                    PhotoCaptureDialogResult::Cancelled
                })
            }),
        };
        let options = CapturePhotoDialogOptions::default();
        assert_eq!(
            block_on(host.show_capture_photo_dialog(Some(&options))).unwrap(),
            block_on(show_capture_photo_dialog(&host, Some(&options))).unwrap()
        );
        assert_eq!(
            block_on(host.show_capture_photo_dialog(Some(&options))).unwrap(),
            PhotoCaptureDialogResult::SecurityDenied
        );
    }

    #[test]
    fn host_video_capture_dialog_capability_show_capture_video_dialog_matches_show_capture_video_dialog()
     {
        let host = HostVideoCaptureDialogCapability {
            provider: Arc::new(()),
            capture: Arc::new(|options: Option<&CaptureVideoDialogOptions>| {
                ok(if options.is_some() {
                    VideoCaptureDialogResult::RuntimeUnavailable
                } else {
                    VideoCaptureDialogResult::Cancelled
                })
            }),
        };
        let options = CaptureVideoDialogOptions::default();
        assert_eq!(
            block_on(host.show_capture_video_dialog(Some(&options))).unwrap(),
            block_on(show_capture_video_dialog(&host, Some(&options))).unwrap()
        );
        assert_eq!(
            block_on(host.show_capture_video_dialog(None)).unwrap(),
            VideoCaptureDialogResult::Cancelled
        );
    }
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaCaptureDialogFacingMode string union; the TS package exports no get_/parse_ free functions
pub fn get_media_capture_dialog_facing_mode_string(
    value: MediaCaptureDialogFacingMode,
) -> &'static str {
    return match value {
        MediaCaptureDialogFacingMode::Environment => "environment",
        MediaCaptureDialogFacingMode::User => "user",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS MediaCaptureDialogFacingMode string union; the TS package exports no get_/parse_ free functions
pub fn parse_media_capture_dialog_facing_mode(value: &str) -> Option<MediaCaptureDialogFacingMode> {
    return match value {
        "environment" => Some(MediaCaptureDialogFacingMode::Environment),
        "user" => Some(MediaCaptureDialogFacingMode::User),
        _ => None,
    };
}

/// Opens the photo-capture dialog, passing `options` only when given.
pub fn show_capture_photo_dialog(
    host_photo_capture_dialog: &HostPhotoCaptureDialogCapability,
    options: Option<&CapturePhotoDialogOptions>,
) -> DialogProviderFuture<PhotoCaptureDialogResult> {
    return (host_photo_capture_dialog.capture)(options);
}

/// Opens the video-capture dialog, passing `options` only when given.
pub fn show_capture_video_dialog(
    host_video_capture_dialog: &HostVideoCaptureDialogCapability,
    options: Option<&CaptureVideoDialogOptions>,
) -> DialogProviderFuture<VideoCaptureDialogResult> {
    return (host_video_capture_dialog.capture)(options);
}

/// Opens the image picker, passing `options` only when given.
pub fn show_open_image_dialog(
    host_image_open_dialog: &HostImageOpenDialogCapability,
    options: Option<&OpenImageDialogOptions>,
) -> DialogProviderFuture<ImageOpenDialogResult> {
    return (host_image_open_dialog.open)(options);
}

impl HostImageOpenDialogCapability {
    pub fn show_open_image_dialog(
        &self,
        options: Option<&OpenImageDialogOptions>,
    ) -> DialogProviderFuture<ImageOpenDialogResult> {
        return show_open_image_dialog(self, options);
    }
}

impl HostPhotoCaptureDialogCapability {
    pub fn show_capture_photo_dialog(
        &self,
        options: Option<&CapturePhotoDialogOptions>,
    ) -> DialogProviderFuture<PhotoCaptureDialogResult> {
        return show_capture_photo_dialog(self, options);
    }
}

impl HostVideoCaptureDialogCapability {
    pub fn show_capture_video_dialog(
        &self,
        options: Option<&CaptureVideoDialogOptions>,
    ) -> DialogProviderFuture<VideoCaptureDialogResult> {
        return show_capture_video_dialog(self, options);
    }
}
