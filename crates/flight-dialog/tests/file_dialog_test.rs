use std::sync::{Arc, Mutex, RwLock};

use flight_dialog::contract::*;
use flight_entity::{Ref, allocate_entity};
use flight_stream::{
    AbortSignal, abort_controller, create_abort_controller, is_abort_signal_aborted,
};

use crate::{block_on, ok};

fn file(name: &str) -> Ref<FileDialogHandle> {
    return create_file_dialog_handle(
        FileDialogHandleKind::File,
        name,
        Some(&format!("/tmp/{}", name)),
        None,
    );
}

fn directory_host(result: DirectoryOpenDialogResult) -> HostDirectoryOpenDialogCapability {
    return HostDirectoryOpenDialogCapability {
        provider: Arc::new(()),
        open: Arc::new(move |_options: Option<&OpenDirectoryDialogOptions>| ok(result.clone())),
    };
}

fn file_open_host(result: FileOpenDialogResult) -> HostFileOpenDialogCapability {
    return HostFileOpenDialogCapability {
        provider: Arc::new(()),
        open: Arc::new(move |_options: &OpenFileDialogOptions| ok(result.clone())),
    };
}

fn file_save_host(result: FileSaveDialogResult) -> HostFileSaveDialogCapability {
    return HostFileSaveDialogCapability {
        provider: Arc::new(()),
        save: Arc::new(move |_options: &SaveFileDialogOptions| ok(result.clone())),
    };
}

fn empty_file_dialog_handle_operations() -> FileDialogHandleOperations {
    let make: fn() -> FileDialogHandleOperations = FileDialogHandleOperations::default;
    return make();
}

fn empty_open_file_dialog_options() -> OpenFileDialogOptions {
    let make: fn() -> OpenFileDialogOptions = OpenFileDialogOptions::default;
    return make();
}

fn empty_save_file_dialog_options() -> SaveFileDialogOptions {
    let make: fn() -> SaveFileDialogOptions = SaveFileDialogOptions::default;
    return make();
}

fn aborted(signal: &Option<AbortSignal>) -> bool {
    return signal.as_ref().is_some_and(is_abort_signal_aborted);
}

mod create_file_dialog_handle {
    use super::*;

    #[test]
    fn creates_an_entity_whose_provider_neutral_runtime_operations_cross_package_boundaries() {
        let read_text: FileDialogReadText =
            Arc::new(|_signal: Option<&AbortSignal>| ok(Some("retained".to_string())));
        let handle = create_file_dialog_handle(
            FileDialogHandleKind::File,
            "picked.txt",
            None,
            Some(FileDialogHandleOperations {
                read_binary: None,
                read_text: Some(read_text.clone()),
                write_binary: None,
                write_text: None,
            }),
        );
        let _: &dyn flight_entity::Entity = &*handle.read().unwrap();
        let operations = get_file_dialog_handle_operations(&handle).unwrap();
        assert!(Arc::ptr_eq(
            operations.read_text.as_ref().unwrap(),
            &read_text
        ));
        assert_eq!(
            block_on((operations.read_text.unwrap())(None)).unwrap(),
            Some("retained".to_string())
        );
        assert!(operations.write_text.is_none());
        let guard = handle.read().unwrap();
        assert_eq!(
            (guard.kind, guard.name.as_str(), guard.path.as_deref()),
            (FileDialogHandleKind::File, "picked.txt", None)
        );
    }

    #[test]
    fn forwards_binary_reads_and_writes_with_their_signal() {
        let written = Arc::new(Mutex::new(Vec::new()));
        let keep = written.clone();
        let handle = create_file_dialog_handle(
            FileDialogHandleKind::File,
            "data.bin",
            Some("/tmp/data.bin"),
            Some(FileDialogHandleOperations {
                read_binary: Some(Arc::new(|_signal: Option<&AbortSignal>| {
                    ok(Some(vec![1_u8, 2, 3].into_boxed_slice()))
                })),
                read_text: None,
                write_binary: Some(Arc::new(
                    move |data: &[u8], signal: Option<&AbortSignal>| {
                        keep.lock()
                            .unwrap()
                            .push((data.to_vec(), signal.is_some_and(is_abort_signal_aborted)));
                        return ok(true);
                    },
                )),
                write_text: None,
            }),
        );
        let operations = get_file_dialog_handle_operations(&handle).unwrap();
        assert_eq!(
            &*block_on((operations.read_binary.unwrap())(None))
                .unwrap()
                .unwrap(),
            &[1, 2, 3]
        );
        let controller = create_abort_controller();
        abort_controller(&controller, None);
        assert!(
            block_on((operations.write_binary.unwrap())(
                &[9, 8],
                Some(&controller.signal)
            ))
            .unwrap()
        );
        assert_eq!(*written.lock().unwrap(), vec![(vec![9, 8], true)]);
    }
}

mod get_file_dialog_handle_kind_string {
    use super::*;

    #[test]
    fn returns_the_source_spelling() {
        assert_eq!(
            get_file_dialog_handle_kind_string(FileDialogHandleKind::Directory),
            "Directory"
        );
    }
}

mod get_file_dialog_handle_operations {
    use super::*;

    #[test]
    fn does_not_turn_a_serialized_ipc_dto_back_into_a_handle_with_runtime_authority() {
        // A value rebuilt from the public fields alone (what a DTO round trip yields) has no runtime.
        let mut forged: FileDialogHandle = allocate_entity();
        forged.kind = FileDialogHandleKind::File;
        forged.name = "picked.txt".to_string();
        forged.path = Some("/tmp/picked.txt".to_string());
        assert!(get_file_dialog_handle_operations(&Arc::new(RwLock::new(forged))).is_none());
    }

    #[test]
    fn is_none_for_a_native_path_handle() {
        assert!(get_file_dialog_handle_operations(&file("a.txt")).is_none());
    }
}

mod initialize_file_dialog_handle {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_file_dialog_handle() {
        let mut handle: FileDialogHandle = allocate_entity();
        initialize_file_dialog_handle(
            &mut handle,
            FileDialogHandleKind::Directory,
            "dir",
            Some("/d"),
            Some(empty_file_dialog_handle_operations()),
        );
        assert_eq!(
            (handle.kind, handle.name.as_str(), handle.path.as_deref()),
            (FileDialogHandleKind::Directory, "dir", Some("/d"))
        );
        assert!(get_file_dialog_handle_operations(&Arc::new(RwLock::new(handle))).is_some());
    }
}

mod parse_file_dialog_handle_kind {
    use super::*;

    #[test]
    fn round_trips_the_source_spelling() {
        assert_eq!(
            parse_file_dialog_handle_kind("File"),
            Some(FileDialogHandleKind::File)
        );
        assert_eq!(parse_file_dialog_handle_kind("file"), None);
    }
}

mod show_open_directory_dialog {
    use super::*;

    #[test]
    fn routes_the_single_directory_operation_through_its_independent_capability_slot() {
        let directory = create_file_dialog_handle(
            FileDialogHandleKind::Directory,
            "mydir",
            Some("/tmp/mydir"),
            None,
        );
        let host = directory_host(DirectoryOpenDialogResult::Selected(
            FileDialogHandleSelection {
                handle: directory.clone(),
            },
        ));
        let DirectoryOpenDialogResult::Selected(selection) =
            block_on(show_open_directory_dialog(&host, None)).unwrap()
        else {
            panic!("expected a selection");
        };
        assert_eq!(
            selection.handle.read().unwrap().kind,
            FileDialogHandleKind::Directory
        );
        assert!(Arc::ptr_eq(&selection.handle, &directory));
    }

    #[test]
    fn preserves_the_directory_specific_runtime_unavailable_outcome() {
        let host = directory_host(DirectoryOpenDialogResult::RuntimeUnavailable);
        assert!(matches!(
            block_on(show_open_directory_dialog(&host, None)).unwrap(),
            DirectoryOpenDialogResult::RuntimeUnavailable
        ));
    }

    #[test]
    fn forwards_cancellation_options_through_the_independent_capability_slot() {
        let seen: Arc<Mutex<Vec<Option<OpenDirectoryDialogOptions>>>> =
            Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        let host = HostDirectoryOpenDialogCapability {
            provider: Arc::new(()),
            open: Arc::new(move |options: Option<&OpenDirectoryDialogOptions>| {
                keep.lock().unwrap().push(options.cloned());
                return ok(DirectoryOpenDialogResult::Cancelled);
            }),
        };
        let controller = create_abort_controller();
        let options = OpenDirectoryDialogOptions {
            signal: Some(controller.signal.clone()),
        };
        block_on(show_open_directory_dialog(&host, Some(&options))).unwrap();
        block_on(show_open_directory_dialog(&host, None)).unwrap();
        abort_controller(&controller, None);
        let seen = seen.lock().unwrap();
        assert!(aborted(&seen[0].as_ref().unwrap().signal));
        // An omitted options argument reaches the provider as omitted.
        assert!(seen[1].is_none());
    }
}

mod show_open_file_dialog {
    use super::*;

    #[test]
    fn routes_file_selection_through_its_independent_capability_slot() {
        let (first, second) = (file("a.txt"), file("b.txt"));
        let seen: Arc<Mutex<Vec<OpenFileDialogOptions>>> = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        let result = FileOpenDialogResult::Selected(FileDialogSelection {
            handles: vec![first.clone(), second.clone()],
        });
        let host = HostFileOpenDialogCapability {
            provider: Arc::new(()),
            open: Arc::new(move |options: &OpenFileDialogOptions| {
                keep.lock().unwrap().push(options.clone());
                return ok(result.clone());
            }),
        };
        let controller = create_abort_controller();
        let options = OpenFileDialogOptions {
            filters: None,
            multiple: Some(true),
            signal: Some(controller.signal.clone()),
        };
        let FileOpenDialogResult::Selected(selection) =
            block_on(show_open_file_dialog(&host, &options)).unwrap()
        else {
            panic!("expected a selection");
        };
        assert_eq!(selection.handles.len(), 2);
        assert!(
            Arc::ptr_eq(&selection.handles[0], &first)
                && Arc::ptr_eq(&selection.handles[1], &second)
        );
        abort_controller(&controller, None);
        let seen = seen.lock().unwrap();
        assert_eq!(seen[0].multiple, Some(true));
        assert!(aborted(&seen[0].signal));
    }

    #[test]
    fn preserves_the_file_open_specific_security_outcome() {
        let host = file_open_host(FileOpenDialogResult::SecurityDenied);
        assert!(matches!(
            block_on(show_open_file_dialog(
                &host,
                &empty_open_file_dialog_options()
            ))
            .unwrap(),
            FileOpenDialogResult::SecurityDenied
        ));
    }

    #[test]
    fn forwards_filters_with_their_mime_key_order() {
        let seen: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        let host = HostFileOpenDialogCapability {
            provider: Arc::new(()),
            open: Arc::new(move |options: &OpenFileDialogOptions| {
                for filter in options.filters.clone().unwrap_or_default() {
                    for key in flight_entity::get_record_keys(&filter.accept) {
                        keep.lock()
                            .unwrap()
                            .push(format!("{}:{}", filter.name, key));
                    }
                }
                return ok(FileOpenDialogResult::Cancelled);
            }),
        };
        let make: fn() -> flight_entity::Record<Vec<String>> = flight_entity::Record::default;
        let mut accept = make();
        flight_entity::set_record_value(
            &mut accept,
            "image/png".to_string(),
            vec![".png".to_string()],
        );
        flight_entity::set_record_value(
            &mut accept,
            "image/jpeg".to_string(),
            vec![".jpg".to_string(), ".jpeg".to_string()],
        );
        let options = OpenFileDialogOptions {
            filters: Some(vec![FileDialogFilter {
                accept,
                name: "Images".to_string(),
            }]),
            multiple: None,
            signal: None,
        };
        block_on(show_open_file_dialog(&host, &options)).unwrap();
        assert_eq!(
            *seen.lock().unwrap(),
            vec!["Images:image/png", "Images:image/jpeg"]
        );
    }
}

mod show_save_file_dialog {
    use super::*;

    #[test]
    fn routes_file_save_through_its_independent_capability_slot() {
        let saved = file("out.txt");
        let host = file_save_host(FileSaveDialogResult::Selected(FileDialogHandleSelection {
            handle: saved.clone(),
        }));
        let options = SaveFileDialogOptions {
            default_name: Some("out.txt".to_string()),
            filters: None,
            signal: None,
        };
        let FileSaveDialogResult::Selected(selection) =
            block_on(show_save_file_dialog(&host, &options)).unwrap()
        else {
            panic!("expected a selection");
        };
        assert_eq!(selection.handle.read().unwrap().name, "out.txt");
    }

    #[test]
    fn preserves_the_file_save_specific_failure_outcome() {
        let host = file_save_host(FileSaveDialogResult::FileSaveFailed);
        assert!(matches!(
            block_on(show_save_file_dialog(
                &host,
                &empty_save_file_dialog_options()
            ))
            .unwrap(),
            FileSaveDialogResult::FileSaveFailed
        ));
    }
}
