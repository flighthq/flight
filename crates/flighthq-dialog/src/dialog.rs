//! Dialog free functions and backend management.
//!
//! Free functions delegate to the active [`DialogBackend`] (a native host's, installed via
//! [`set_dialog_backend`]). All functions resolve to sentinels (`[]` / `None` / `false`) on
//! cancel or when the host lacks the surface — dialog dismissal is an expected outcome, not an
//! error. The web backend (`createWebDialogBackend` in TS) is a browser-substrate concern and
//! lives in `flighthq-host-web`, not here.

use flighthq_types::{
    DialogBackend, FileDialogHandle, MessageDialogKind, MessageDialogOptions, MessageDialogResult,
    OpenDirectoryDialogOptions, OpenFileDialogOptions, PromptDialogOptions, SaveFileDialogOptions,
};
use std::sync::{Arc, Mutex};

/// Returns the active dialog backend. Panics if no backend has been set.
/// Callers should ensure [`set_dialog_backend`] is called during startup.
pub fn get_dialog_backend() -> Arc<dyn DialogBackend> {
    let guard = BACKEND.lock().expect("dialog backend mutex poisoned");
    match guard.as_ref() {
        Some(b) => Arc::clone(b),
        None => panic!("no dialog backend installed; call set_dialog_backend before use"),
    }
}

/// Installs a dialog backend. Pass `None` to clear the active backend.
///
/// Typically called once at application startup by a host adapter.
pub fn set_dialog_backend(backend: Option<Arc<dyn DialogBackend>>) {
    let mut guard = BACKEND.lock().expect("dialog backend mutex poisoned");
    *guard = backend;
}

/// Shows a yes/no confirmation dialog. Returns `false` on cancel or when the host lacks the
/// surface.
pub async fn show_confirm_dialog(options: &MessageDialogOptions) -> bool {
    get_dialog_backend().confirm(options).await
}

/// Shows an error-severity message box. Returns the pressed button index, cancelled flag, and
/// final checkbox state. Convenience over [`show_message_dialog`] with `kind = Error`.
pub async fn show_error_box(title: &str, content: &str) -> MessageDialogResult {
    let options = MessageDialogOptions {
        kind: MessageDialogKind::Error,
        message: content.to_owned(),
        title: Some(title.to_owned()),
        ..Default::default()
    };
    get_dialog_backend().message(&options).await
}

/// Shows an error-severity message dialog. Forces `kind = Error` on the given options and returns
/// the full result including the cancelled flag.
pub async fn show_error_dialog(options: &MessageDialogOptions) -> MessageDialogResult {
    let mut forced = options.clone();
    forced.kind = MessageDialogKind::Error;
    get_dialog_backend().message(&forced).await
}

/// Shows an info-severity message dialog. Forces `kind = Info` on the given options and returns
/// the full result including the cancelled flag.
pub async fn show_info_dialog(options: &MessageDialogOptions) -> MessageDialogResult {
    let mut forced = options.clone();
    forced.kind = MessageDialogKind::Info;
    get_dialog_backend().message(&forced).await
}

/// Shows a message dialog. Returns the pressed button index, cancelled flag, and final checkbox
/// state. On a host that only supports a dismiss action, returns `button_index: 0` and the
/// requested `checkbox_checked` value.
pub async fn show_message_dialog(options: &MessageDialogOptions) -> MessageDialogResult {
    get_dialog_backend().message(options).await
}

/// Shows a directory picker (distinct from an open-file picker with `directory: true`). Returns
/// selected directory handles (`[]` on cancel). On web, `path` is `None` in each handle.
pub async fn show_open_directory_dialog(
    options: &OpenDirectoryDialogOptions,
) -> Vec<FileDialogHandle> {
    get_dialog_backend().open_directory(options).await
}

/// Shows an open-file picker. Returns selected handles (`[]` on cancel). On web, `path` is `None`
/// in each handle — browsers cannot expose real host paths.
pub async fn show_open_file_dialog(options: &OpenFileDialogOptions) -> Vec<FileDialogHandle> {
    get_dialog_backend().open_file(options).await
}

/// Shows a text prompt. Returns the entered string, or `None` on cancel or when the host lacks the
/// surface.
pub async fn show_prompt_dialog(options: &PromptDialogOptions) -> Option<String> {
    get_dialog_backend().prompt(options).await
}

/// Shows a save-file picker. Returns a handle for the chosen destination, or `None` on cancel.
pub async fn show_save_file_dialog(options: &SaveFileDialogOptions) -> Option<FileDialogHandle> {
    get_dialog_backend().save_file(options).await
}

/// Shows a warning-severity message dialog. Forces `kind = Warning` on the given options and
/// returns the full result including the cancelled flag.
pub async fn show_warning_dialog(options: &MessageDialogOptions) -> MessageDialogResult {
    let mut forced = options.clone();
    forced.kind = MessageDialogKind::Warning;
    get_dialog_backend().message(&forced).await
}

static BACKEND: Mutex<Option<Arc<dyn DialogBackend>>> = Mutex::new(None);

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::FileDialogHandleKind;
    use pollster::block_on;
    use serial_test::serial;
    use std::future::Future;
    use std::pin::Pin;

    fn fake_handle(name: &str) -> FileDialogHandle {
        FileDialogHandle {
            kind: FileDialogHandleKind::File,
            name: name.to_owned(),
            path: Some(format!("/tmp/{name}")),
        }
    }

    // A fake backend mirroring the TS `fakeBackend()`: confirm → true, message → button 2,
    // openDirectory → one directory handle, openFile → two file handles, prompt → "typed"
    // (recording the message), saveFile → an out.txt handle.
    struct FakeBackend;

    impl DialogBackend for FakeBackend {
        fn open_file(
            &self,
            _options: &OpenFileDialogOptions,
        ) -> Pin<Box<dyn Future<Output = Vec<FileDialogHandle>> + Send>> {
            Box::pin(async { vec![fake_handle("a.txt"), fake_handle("b.txt")] })
        }
        fn open_directory(
            &self,
            _options: &OpenDirectoryDialogOptions,
        ) -> Pin<Box<dyn Future<Output = Vec<FileDialogHandle>> + Send>> {
            Box::pin(async {
                vec![FileDialogHandle {
                    kind: FileDialogHandleKind::Directory,
                    name: "mydir".to_owned(),
                    path: Some("/tmp/mydir".to_owned()),
                }]
            })
        }
        fn save_file(
            &self,
            _options: &SaveFileDialogOptions,
        ) -> Pin<Box<dyn Future<Output = Option<FileDialogHandle>> + Send>> {
            Box::pin(async { Some(fake_handle("out.txt")) })
        }
        fn message(
            &self,
            _options: &MessageDialogOptions,
        ) -> Pin<Box<dyn Future<Output = MessageDialogResult> + Send>> {
            Box::pin(async {
                MessageDialogResult {
                    button_index: 2,
                    cancelled: false,
                    checkbox_checked: false,
                }
            })
        }
        fn confirm(
            &self,
            _options: &MessageDialogOptions,
        ) -> Pin<Box<dyn Future<Output = bool> + Send>> {
            Box::pin(async { true })
        }
        fn prompt(
            &self,
            options: &PromptDialogOptions,
        ) -> Pin<Box<dyn Future<Output = Option<String>> + Send>> {
            // Record the captured message in shared state so the test can assert on it.
            *LAST_PROMPT_MESSAGE.lock().unwrap() = Some(options.message.clone());
            Box::pin(async { Some("typed".to_owned()) })
        }
    }

    static LAST_PROMPT_MESSAGE: Mutex<Option<String>> = Mutex::new(None);

    // A capture backend that records the message options passed to `message`, used to assert the
    // forced `kind` for the severity helpers.
    struct CaptureKindBackend;

    static CAPTURED_KIND: Mutex<Option<MessageDialogKind>> = Mutex::new(None);
    static CAPTURED_TITLE: Mutex<Option<String>> = Mutex::new(None);
    static CAPTURED_MESSAGE: Mutex<Option<String>> = Mutex::new(None);

    impl DialogBackend for CaptureKindBackend {
        fn open_file(
            &self,
            _options: &OpenFileDialogOptions,
        ) -> Pin<Box<dyn Future<Output = Vec<FileDialogHandle>> + Send>> {
            Box::pin(async { vec![] })
        }
        fn open_directory(
            &self,
            _options: &OpenDirectoryDialogOptions,
        ) -> Pin<Box<dyn Future<Output = Vec<FileDialogHandle>> + Send>> {
            Box::pin(async { vec![] })
        }
        fn save_file(
            &self,
            _options: &SaveFileDialogOptions,
        ) -> Pin<Box<dyn Future<Output = Option<FileDialogHandle>> + Send>> {
            Box::pin(async { None })
        }
        fn message(
            &self,
            options: &MessageDialogOptions,
        ) -> Pin<Box<dyn Future<Output = MessageDialogResult> + Send>> {
            *CAPTURED_KIND.lock().unwrap() = Some(options.kind);
            *CAPTURED_TITLE.lock().unwrap() = options.title.clone();
            *CAPTURED_MESSAGE.lock().unwrap() = Some(options.message.clone());
            Box::pin(async {
                MessageDialogResult {
                    button_index: 0,
                    cancelled: false,
                    checkbox_checked: false,
                }
            })
        }
        fn confirm(
            &self,
            _options: &MessageDialogOptions,
        ) -> Pin<Box<dyn Future<Output = bool> + Send>> {
            Box::pin(async { false })
        }
        fn prompt(
            &self,
            _options: &PromptDialogOptions,
        ) -> Pin<Box<dyn Future<Output = Option<String>> + Send>> {
            Box::pin(async { None })
        }
    }

    #[test]
    #[serial]
    fn get_dialog_backend_returns_registered_backend() {
        set_dialog_backend(Some(Arc::new(FakeBackend)));
        let _b = get_dialog_backend();
        set_dialog_backend(None);
    }

    #[test]
    #[serial]
    fn set_dialog_backend_installs_and_clears_backend() {
        set_dialog_backend(Some(Arc::new(FakeBackend)));
        let _b = get_dialog_backend();
        set_dialog_backend(None);
    }

    #[test]
    #[serial]
    fn show_confirm_dialog_delegates_to_backend() {
        set_dialog_backend(Some(Arc::new(FakeBackend)));
        let options = MessageDialogOptions {
            message: "sure?".to_owned(),
            ..Default::default()
        };
        assert!(block_on(show_confirm_dialog(&options)));
        set_dialog_backend(None);
    }

    #[test]
    #[serial]
    fn show_error_box_uses_error_kind_and_passes_title_and_message() {
        set_dialog_backend(Some(Arc::new(CaptureKindBackend)));
        let _ = block_on(show_error_box("Fatal", "Something went wrong"));
        assert_eq!(
            *CAPTURED_KIND.lock().unwrap(),
            Some(MessageDialogKind::Error)
        );
        assert_eq!(CAPTURED_TITLE.lock().unwrap().as_deref(), Some("Fatal"));
        assert_eq!(
            CAPTURED_MESSAGE.lock().unwrap().as_deref(),
            Some("Something went wrong")
        );
        set_dialog_backend(None);
    }

    #[test]
    #[serial]
    fn show_error_dialog_forces_error_kind() {
        set_dialog_backend(Some(Arc::new(CaptureKindBackend)));
        let options = MessageDialogOptions {
            message: "boom".to_owned(),
            ..Default::default()
        };
        let _ = block_on(show_error_dialog(&options));
        assert_eq!(
            *CAPTURED_KIND.lock().unwrap(),
            Some(MessageDialogKind::Error)
        );
        set_dialog_backend(None);
    }

    #[test]
    #[serial]
    fn show_info_dialog_forces_info_kind() {
        set_dialog_backend(Some(Arc::new(CaptureKindBackend)));
        let options = MessageDialogOptions {
            message: "note".to_owned(),
            kind: MessageDialogKind::Error,
            ..Default::default()
        };
        let _ = block_on(show_info_dialog(&options));
        assert_eq!(
            *CAPTURED_KIND.lock().unwrap(),
            Some(MessageDialogKind::Info)
        );
        set_dialog_backend(None);
    }

    #[test]
    #[serial]
    fn show_message_dialog_delegates_to_backend() {
        set_dialog_backend(Some(Arc::new(FakeBackend)));
        let options = MessageDialogOptions {
            message: "hello".to_owned(),
            ..Default::default()
        };
        let result = block_on(show_message_dialog(&options));
        assert_eq!(result.button_index, 2);
        set_dialog_backend(None);
    }

    #[test]
    #[serial]
    fn show_open_directory_dialog_delegates_to_backend() {
        set_dialog_backend(Some(Arc::new(FakeBackend)));
        let handles = block_on(show_open_directory_dialog(
            &OpenDirectoryDialogOptions::default(),
        ));
        assert_eq!(handles.len(), 1);
        assert_eq!(handles[0].kind, FileDialogHandleKind::Directory);
        assert_eq!(handles[0].name, "mydir");
        set_dialog_backend(None);
    }

    #[test]
    #[serial]
    fn show_open_file_dialog_delegates_and_returns_handles_with_path() {
        set_dialog_backend(Some(Arc::new(FakeBackend)));
        let options = OpenFileDialogOptions {
            multiple: true,
            ..Default::default()
        };
        let handles = block_on(show_open_file_dialog(&options));
        assert_eq!(handles.len(), 2);
        assert_eq!(handles[0].kind, FileDialogHandleKind::File);
        assert_eq!(handles[0].name, "a.txt");
        assert_eq!(handles[0].path.as_deref(), Some("/tmp/a.txt"));
        set_dialog_backend(None);
    }

    #[test]
    #[serial]
    fn show_prompt_dialog_delegates_with_options() {
        *LAST_PROMPT_MESSAGE.lock().unwrap() = None;
        set_dialog_backend(Some(Arc::new(FakeBackend)));
        let options = PromptDialogOptions {
            message: "name?".to_owned(),
            default_value: Some("default".to_owned()),
            ..Default::default()
        };
        let result = block_on(show_prompt_dialog(&options));
        assert_eq!(result.as_deref(), Some("typed"));
        assert_eq!(
            LAST_PROMPT_MESSAGE.lock().unwrap().as_deref(),
            Some("name?")
        );
        set_dialog_backend(None);
    }

    #[test]
    #[serial]
    fn show_save_file_dialog_delegates_to_backend() {
        set_dialog_backend(Some(Arc::new(FakeBackend)));
        let handle = block_on(show_save_file_dialog(&SaveFileDialogOptions::default()));
        let handle = handle.expect("fake backend returns a handle");
        assert_eq!(handle.kind, FileDialogHandleKind::File);
        assert_eq!(handle.name, "out.txt");
        set_dialog_backend(None);
    }

    #[test]
    #[serial]
    fn show_warning_dialog_forces_warning_kind() {
        set_dialog_backend(Some(Arc::new(CaptureKindBackend)));
        let options = MessageDialogOptions {
            message: "careful".to_owned(),
            ..Default::default()
        };
        let _ = block_on(show_warning_dialog(&options));
        assert_eq!(
            *CAPTURED_KIND.lock().unwrap(),
            Some(MessageDialogKind::Warning)
        );
        set_dialog_backend(None);
    }
}
