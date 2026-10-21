use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::future::Future;
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

    fn handle() -> Ref<FileDialogHandle> {
        return create_file_dialog_handle(
            FileDialogHandleKind::File,
            "a.txt",
            Some("/a.txt"),
            None,
        );
    }

    #[test]
    fn file_dialog_handle_methods_get_file_dialog_handle_operations_matches_get_file_dialog_handle_operations()
     {
        let with = create_file_dialog_handle(
            FileDialogHandleKind::File,
            "a",
            None,
            Some(FileDialogHandleOperations::default()),
        );
        assert_eq!(
            with.get_file_dialog_handle_operations().is_some(),
            get_file_dialog_handle_operations(&with).is_some()
        );
        assert!(with.get_file_dialog_handle_operations().is_some());
        assert!(handle().get_file_dialog_handle_operations().is_none());
    }

    #[test]
    fn host_directory_open_dialog_capability_show_open_directory_dialog_matches_show_open_directory_dialog()
     {
        let picked = handle();
        let host = HostDirectoryOpenDialogCapability {
            provider: Arc::new(()),
            open: Arc::new(move |options: Option<&OpenDirectoryDialogOptions>| {
                return ok(match options {
                    Some(_) => DirectoryOpenDialogResult::Selected(FileDialogHandleSelection {
                        handle: picked.clone(),
                    }),
                    None => DirectoryOpenDialogResult::Cancelled,
                });
            }),
        };
        let options = OpenDirectoryDialogOptions::default();
        let (DirectoryOpenDialogResult::Selected(a), DirectoryOpenDialogResult::Selected(b)) = (
            block_on(host.show_open_directory_dialog(Some(&options))).unwrap(),
            block_on(show_open_directory_dialog(&host, Some(&options))).unwrap(),
        ) else {
            panic!("expected selections");
        };
        assert!(Arc::ptr_eq(&a.handle, &b.handle));
        assert!(matches!(
            block_on(host.show_open_directory_dialog(None)).unwrap(),
            DirectoryOpenDialogResult::Cancelled
        ));
    }

    #[test]
    fn host_file_open_dialog_capability_show_open_file_dialog_matches_show_open_file_dialog() {
        let host = HostFileOpenDialogCapability {
            provider: Arc::new(()),
            open: Arc::new(|options: &OpenFileDialogOptions| {
                return ok(if options.multiple == Some(true) {
                    FileOpenDialogResult::SecurityDenied
                } else {
                    FileOpenDialogResult::Cancelled
                });
            }),
        };
        let options = OpenFileDialogOptions {
            multiple: Some(true),
            ..OpenFileDialogOptions::default()
        };
        assert!(matches!(
            block_on(host.show_open_file_dialog(&options)).unwrap(),
            FileOpenDialogResult::SecurityDenied
        ));
        assert!(matches!(
            block_on(show_open_file_dialog(&host, &options)).unwrap(),
            FileOpenDialogResult::SecurityDenied
        ));
    }

    #[test]
    fn host_file_save_dialog_capability_show_save_file_dialog_matches_show_save_file_dialog() {
        let host = HostFileSaveDialogCapability {
            provider: Arc::new(()),
            save: Arc::new(|options: &SaveFileDialogOptions| {
                return ok(if options.default_name.is_some() {
                    FileSaveDialogResult::FileSaveFailed
                } else {
                    FileSaveDialogResult::Cancelled
                });
            }),
        };
        let options = SaveFileDialogOptions {
            default_name: Some("out.txt".to_string()),
            ..SaveFileDialogOptions::default()
        };
        assert!(matches!(
            block_on(host.show_save_file_dialog(&options)).unwrap(),
            FileSaveDialogResult::FileSaveFailed
        ));
        assert!(matches!(
            block_on(show_save_file_dialog(&host, &options)).unwrap(),
            FileSaveDialogResult::FileSaveFailed
        ));
    }
}

/// Method sugar on the shared `Ref<FileDialogHandle>` handle (D18).
pub trait FileDialogHandleMethods {
    fn get_file_dialog_handle_operations(&self) -> Option<FileDialogHandleOperations>;
}

/// Creates a dialog handle carrying `kind`, `name`, `path` and the provider-neutral runtime
/// `operations` (`None` for native path handles).
pub fn create_file_dialog_handle(
    kind: FileDialogHandleKind,
    name: &str,
    path: Option<&str>,
    operations: Option<FileDialogHandleOperations>,
) -> Ref<FileDialogHandle> {
    let mut handle: FileDialogHandle = allocate_entity();
    initialize_file_dialog_handle(&mut handle, kind, name, path, operations);
    return Arc::new(RwLock::new(handle));
}

/// The construction initializer of `create_file_dialog_handle`: sets the identity that crosses from a
/// picker provider into filesystem, and installs `operations` as the internal runtime extension point
/// (not serialized descriptor data).
pub fn initialize_file_dialog_handle(
    handle: &mut FileDialogHandle,
    kind: FileDialogHandleKind,
    name: &str,
    path: Option<&str>,
    operations: Option<FileDialogHandleOperations>,
) {
    handle.kind = kind;
    handle.name = name.to_string();
    handle.path = path.map(|path| path.to_string());
    handle.operations = operations;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS FileDialogHandleKind string union; the TS package exports no get_/parse_ free functions
pub fn get_file_dialog_handle_kind_string(value: FileDialogHandleKind) -> &'static str {
    return match value {
        FileDialogHandleKind::File => "File",
        FileDialogHandleKind::Directory => "Directory",
    };
}

/// The handle's runtime operations, or `None` for a handle without them (a native path handle, or a
/// value assembled from public fields only, which cannot acquire authority by matching them).
pub fn get_file_dialog_handle_operations(
    handle: &Ref<FileDialogHandle>,
) -> Option<FileDialogHandleOperations> {
    return handle.read().unwrap().operations.clone();
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS FileDialogHandleKind string union; the TS package exports no get_/parse_ free functions
pub fn parse_file_dialog_handle_kind(value: &str) -> Option<FileDialogHandleKind> {
    return match value {
        "File" => Some(FileDialogHandleKind::File),
        "Directory" => Some(FileDialogHandleKind::Directory),
        _ => None,
    };
}

/// Opens a directory picker, passing `options` only when given (the source calls `open()` without an
/// argument otherwise).
pub fn show_open_directory_dialog(
    host_directory_open_dialog: &HostDirectoryOpenDialogCapability,
    options: Option<&OpenDirectoryDialogOptions>,
) -> DialogProviderFuture<DirectoryOpenDialogResult> {
    return (host_directory_open_dialog.open)(options);
}

/// Opens a file picker with `options` exactly as given.
pub fn show_open_file_dialog(
    host_file_open_dialog: &HostFileOpenDialogCapability,
    options: &OpenFileDialogOptions,
) -> DialogProviderFuture<FileOpenDialogResult> {
    return (host_file_open_dialog.open)(options);
}

/// Opens a save picker with `options` exactly as given.
pub fn show_save_file_dialog(
    host_file_save_dialog: &HostFileSaveDialogCapability,
    options: &SaveFileDialogOptions,
) -> DialogProviderFuture<FileSaveDialogResult> {
    return (host_file_save_dialog.save)(options);
}

impl HostDirectoryOpenDialogCapability {
    pub fn show_open_directory_dialog(
        &self,
        options: Option<&OpenDirectoryDialogOptions>,
    ) -> DialogProviderFuture<DirectoryOpenDialogResult> {
        return show_open_directory_dialog(self, options);
    }
}

impl HostFileOpenDialogCapability {
    pub fn show_open_file_dialog(
        &self,
        options: &OpenFileDialogOptions,
    ) -> DialogProviderFuture<FileOpenDialogResult> {
        return show_open_file_dialog(self, options);
    }
}

impl HostFileSaveDialogCapability {
    pub fn show_save_file_dialog(
        &self,
        options: &SaveFileDialogOptions,
    ) -> DialogProviderFuture<FileSaveDialogResult> {
        return show_save_file_dialog(self, options);
    }
}

impl FileDialogHandleMethods for Ref<FileDialogHandle> {
    fn get_file_dialog_handle_operations(&self) -> Option<FileDialogHandleOperations> {
        return get_file_dialog_handle_operations(self);
    }
}
