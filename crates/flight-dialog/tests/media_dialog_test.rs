use std::sync::{Arc, Mutex};

use flight_dialog::contract::*;
use flight_stream::{abort_controller, create_abort_controller, is_abort_signal_aborted};

use crate::{block_on, ok};

mod get_media_capture_dialog_facing_mode_string {
    use super::*;

    #[test]
    fn returns_the_source_spelling() {
        assert_eq!(
            get_media_capture_dialog_facing_mode_string(MediaCaptureDialogFacingMode::Environment),
            "environment"
        );
    }
}

mod parse_media_capture_dialog_facing_mode {
    use super::*;

    #[test]
    fn round_trips_the_source_spelling() {
        assert_eq!(
            parse_media_capture_dialog_facing_mode("user"),
            Some(MediaCaptureDialogFacingMode::User)
        );
        assert_eq!(parse_media_capture_dialog_facing_mode("front"), None);
    }
}

mod show_capture_photo_dialog {
    use super::*;

    #[test]
    fn routes_capture_through_the_explicit_photo_capture_slot_and_forwards_options() {
        let seen: Arc<Mutex<Vec<Option<CapturePhotoDialogOptions>>>> =
            Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        let host = HostPhotoCaptureDialogCapability {
            provider: Arc::new(()),
            capture: Arc::new(move |options: Option<&CapturePhotoDialogOptions>| {
                keep.lock().unwrap().push(options.cloned());
                return ok(PhotoCaptureDialogResult::Selected(DialogPhotoSelection {
                    photo: DialogImage {
                        data_url: "data:image/png;base64,AA==".to_string(),
                        height: 480.0,
                        mime_type: "image/png".to_string(),
                        width: 640.0,
                    },
                }));
            }),
        };
        let controller = create_abort_controller();
        let options = CapturePhotoDialogOptions {
            facing_mode: Some(MediaCaptureDialogFacingMode::User),
            signal: Some(controller.signal.clone()),
        };
        let PhotoCaptureDialogResult::Selected(selection) =
            block_on(show_capture_photo_dialog(&host, Some(&options))).unwrap()
        else {
            panic!("expected a photo");
        };
        assert_eq!(selection.photo.width, 640.0);
        abort_controller(&controller, None);
        let seen = seen.lock().unwrap();
        let forwarded = seen[0].as_ref().unwrap();
        assert_eq!(
            forwarded.facing_mode,
            Some(MediaCaptureDialogFacingMode::User)
        );
        assert!(
            forwarded
                .signal
                .as_ref()
                .is_some_and(is_abort_signal_aborted)
        );
    }

    #[test]
    fn preserves_the_operation_specific_failure_outcome() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        let host = HostPhotoCaptureDialogCapability {
            provider: Arc::new(()),
            capture: Arc::new(move |options: Option<&CapturePhotoDialogOptions>| {
                keep.lock().unwrap().push(options.is_none());
                return ok(PhotoCaptureDialogResult::PhotoCaptureFailed);
            }),
        };
        assert_eq!(
            block_on(show_capture_photo_dialog(&host, None)).unwrap(),
            PhotoCaptureDialogResult::PhotoCaptureFailed
        );
        assert_eq!(*seen.lock().unwrap(), vec![true]);
    }
}

mod show_capture_video_dialog {
    use super::*;

    #[test]
    fn routes_capture_through_the_explicit_video_capture_slot_and_preserves_decoded_duration() {
        let seen: Arc<Mutex<Vec<Option<CaptureVideoDialogOptions>>>> =
            Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        let host = HostVideoCaptureDialogCapability {
            provider: Arc::new(()),
            capture: Arc::new(move |options: Option<&CaptureVideoDialogOptions>| {
                keep.lock().unwrap().push(options.cloned());
                return ok(VideoCaptureDialogResult::Selected(DialogVideoSelection {
                    video: DialogVideo {
                        data_url: "data:video/mp4;base64,AA==".to_string(),
                        duration: 2.5,
                        mime_type: "video/mp4".to_string(),
                    },
                }));
            }),
        };
        let options = CaptureVideoDialogOptions {
            facing_mode: Some(MediaCaptureDialogFacingMode::Environment),
            signal: None,
        };
        let VideoCaptureDialogResult::Selected(selection) =
            block_on(show_capture_video_dialog(&host, Some(&options))).unwrap()
        else {
            panic!("expected a video");
        };
        assert_eq!(selection.video.duration, 2.5);
        assert_eq!(
            seen.lock().unwrap()[0].as_ref().unwrap().facing_mode,
            Some(MediaCaptureDialogFacingMode::Environment)
        );
    }
}

mod show_open_image_dialog {
    use super::*;

    #[test]
    fn routes_selection_through_the_explicit_image_open_slot_and_forwards_cancellation() {
        let seen: Arc<Mutex<Vec<Option<OpenImageDialogOptions>>>> =
            Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        let host = HostImageOpenDialogCapability {
            provider: Arc::new(()),
            open: Arc::new(move |options: Option<&OpenImageDialogOptions>| {
                keep.lock().unwrap().push(options.cloned());
                return ok(ImageOpenDialogResult::Cancelled);
            }),
        };
        let controller = create_abort_controller();
        let options = OpenImageDialogOptions {
            signal: Some(controller.signal.clone()),
        };
        assert_eq!(
            block_on(show_open_image_dialog(&host, Some(&options))).unwrap(),
            ImageOpenDialogResult::Cancelled
        );
        abort_controller(&controller, None);
        assert!(
            seen.lock().unwrap()[0]
                .as_ref()
                .unwrap()
                .signal
                .as_ref()
                .is_some_and(is_abort_signal_aborted)
        );
    }

    #[test]
    fn preserves_the_operation_specific_failure_outcome() {
        let host = HostImageOpenDialogCapability {
            provider: Arc::new(()),
            open: Arc::new(|_options: Option<&OpenImageDialogOptions>| {
                ok(ImageOpenDialogResult::ImageOpenFailed)
            }),
        };
        assert_eq!(
            block_on(show_open_image_dialog(&host, None)).unwrap(),
            ImageOpenDialogResult::ImageOpenFailed
        );
    }
}
