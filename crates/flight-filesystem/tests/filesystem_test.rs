use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use flight_dialog::{FileDialogHandleKind, FileDialogHandleOperations, create_file_dialog_handle};
use flight_entity::Unknown;
use flight_filesystem::contract::*;
use flight_stream::{
    AbortSignal, abort_controller, create_abort_controller, is_abort_signal_aborted,
};

use crate::filesystem_fixture::*;

fn entry(name: &str, path: &str) -> FileEntry {
    return FileEntry {
        name: name.to_string(),
        path: path.to_string(),
        is_directory: false,
    };
}

fn reason(text: &str) -> Unknown {
    return Some(Arc::new(text.to_string()));
}

// Asserts the recorded signal is the caller's own (aborting the caller's controller aborts it).
fn forwarded(recorded: &Option<AbortSignal>, controller: &flight_stream::AbortController) -> bool {
    let Some(recorded) = recorded else {
        return false;
    };
    if is_abort_signal_aborted(recorded) {
        return false;
    }
    abort_controller(controller, None);
    return is_abort_signal_aborted(recorded);
}

mod append_text_file {
    use super::*;

    #[test]
    fn uses_the_provider_on_the_passed_host() {
        let calls = call_log::<(String, String, Option<AbortSignal>)>();
        let record = calls.clone();
        let mut host = host_with();
        host.append_text_file = Some(Arc::new(move |path, data, signal| {
            record
                .lock()
                .unwrap()
                .push((path.to_string(), data.to_string(), signal_state(signal)));
            return ok(true);
        }));
        assert_eq!(block_on(append_text_file(&host, "a", "b", None)), Ok(true));
        let calls = calls.lock().unwrap();
        assert_eq!((calls[0].0.as_str(), calls[0].1.as_str()), ("a", "b"));
        // An omitted signal stays omitted.
        assert!(calls[0].2.is_none());
    }

    #[test]
    fn forwards_a_passed_signal_unchanged() {
        let calls = call_log::<Option<AbortSignal>>();
        let record = calls.clone();
        let mut host = host_with();
        host.append_text_file = Some(Arc::new(move |_path, _data, signal| {
            record.lock().unwrap().push(signal_state(signal));
            return ok(true);
        }));
        let controller = create_abort_controller();
        block_on(append_text_file(&host, "a", "b", Some(&controller.signal))).unwrap();
        assert!(forwarded(&calls.lock().unwrap()[0], &controller));
    }

    #[test]
    fn returns_false_when_omitted() {
        assert_eq!(
            block_on(append_text_file(&host_with(), "a", "b", None)),
            Ok(false)
        );
    }

    #[test]
    fn rejects_pre_aborted_appends_without_starting_provider_work() {
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let mut host = host_with();
        host.append_text_file = Some(Arc::new(move |_path, _data, _signal| {
            count.fetch_add(1, Ordering::SeqCst);
            return ok(true);
        }));
        let why = reason("cancel append");
        let controller = aborted_controller(&why);
        let thrown = rejection_reason(append_text_file(&host, "a", "b", Some(&controller.signal)));
        assert!(same_reason(&thrown, &why));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}

mod can_access_file {
    use super::*;

    #[test]
    fn returns_false_when_the_provider_omits_the_operation() {
        assert_eq!(
            block_on(can_access_file(&host_with(), "a", FileAccessMode::Readable)),
            Ok(false)
        );
    }

    #[test]
    fn forwards_the_path_and_mode() {
        let calls = call_log::<(String, FileAccessMode)>();
        let record = calls.clone();
        let mut host = host_with();
        host.can_access_file = Some(Arc::new(move |path, mode| {
            record.lock().unwrap().push((path.to_string(), mode));
            return ok(true);
        }));
        assert_eq!(
            block_on(can_access_file(&host, "a", FileAccessMode::Executable)),
            Ok(true)
        );
        assert_eq!(
            *calls.lock().unwrap(),
            vec![("a".to_string(), FileAccessMode::Executable)]
        );
    }
}

mod copy_file {
    use super::*;

    #[test]
    fn forwards_both_paths() {
        let calls = call_log::<(String, String)>();
        let record = calls.clone();
        let mut host = host_with();
        host.copy = Some(Arc::new(move |from, to| {
            record
                .lock()
                .unwrap()
                .push((from.to_string(), to.to_string()));
            return ok(true);
        }));
        block_on(copy_file(&host, "a", "b")).unwrap();
        assert_eq!(
            *calls.lock().unwrap(),
            vec![("a".to_string(), "b".to_string())]
        );
    }

    #[test]
    fn returns_false_when_omitted() {
        assert_eq!(block_on(copy_file(&host_with(), "a", "b")), Ok(false));
    }
}

mod create_file_symlink {
    use super::*;

    #[test]
    fn owns_the_documented_absence_result_outside_host_providers() {
        assert_eq!(block_on(create_file_symlink("a", "b")), Ok(false));
    }
}

mod directory_exists {
    use super::*;

    #[test]
    fn forwards_the_path() {
        let calls = call_log::<String>();
        let record = calls.clone();
        let mut host = host_with();
        host.directory_exists = Some(Arc::new(move |path| {
            record.lock().unwrap().push(path.to_string());
            return ok(true);
        }));
        assert_eq!(block_on(directory_exists(&host, "a")), Ok(true));
        assert_eq!(*calls.lock().unwrap(), vec!["a".to_string()]);
        assert_eq!(block_on(directory_exists(&host_with(), "a")), Ok(false));
    }
}

mod file_exists {
    use super::*;

    #[test]
    fn forwards_the_path() {
        let calls = call_log::<String>();
        let record = calls.clone();
        let mut host = host_with();
        host.file_exists = Some(Arc::new(move |path| {
            record.lock().unwrap().push(path.to_string());
            return ok(true);
        }));
        assert_eq!(block_on(file_exists(&host, "a")), Ok(true));
        assert_eq!(*calls.lock().unwrap(), vec!["a".to_string()]);
        assert_eq!(block_on(file_exists(&host_with(), "a")), Ok(false));
    }
}

mod find_files {
    use super::*;

    fn host_listing(entries: Vec<FileEntry>) -> HostFileSystemCapability {
        let mut host = host_with();
        host.read_directory_recursive = Some(Arc::new(move |_path, _options| ok(entries.clone())));
        return host;
    }

    fn found(entries: Vec<FileEntry>, pattern: &str) -> Vec<FileEntry> {
        return block_on(find_files(&host_listing(entries), "", pattern, None)).unwrap();
    }

    #[test]
    fn filters_recursive_provider_entries_by_glob() {
        let entries = vec![entry("a.txt", "a.txt"), entry("b.bin", "nested/b.bin")];
        assert_eq!(found(entries.clone(), "**/*.bin"), vec![entries[1].clone()]);
    }

    #[test]
    fn keeps_entries_whose_name_or_path_matches() {
        let entries = vec![entry("b.bin", "deep/b.bin"), entry("c.txt", "bin/c.txt")];
        // `*.bin` cannot cross `/`, so only the name of the first entry matches.
        assert_eq!(found(entries.clone(), "*.bin"), vec![entries[0].clone()]);
        assert_eq!(found(entries.clone(), "bin/*"), vec![entries[1].clone()]);
    }

    #[test]
    fn a_double_star_spans_segments_and_its_slash_is_optional() {
        let entries = vec![entry("x.bin", "a/b/x.bin"), entry("y.bin", "y.bin")];
        assert_eq!(
            found(entries.clone(), "a/**/x.bin"),
            vec![entries[0].clone()]
        );
        assert_eq!(found(entries.clone(), "**y.bin"), vec![entries[1].clone()]);
    }

    #[test]
    fn a_question_mark_matches_one_non_slash_unit() {
        let entries = vec![
            entry("a1", "d/a1"),
            entry("a12", "d/a12"),
            entry("q", "a/b"),
        ];
        assert_eq!(found(entries.clone(), "a?"), vec![entries[0].clone()]);
        assert!(found(vec![entry("z", "a/b")], "a?b").is_empty());
    }

    #[test]
    fn regex_specials_are_literal() {
        let entries = vec![
            entry("a.b", "a.b"),
            entry("axb", "axb"),
            entry("(x)+[y]", "(x)+[y]"),
        ];
        assert_eq!(found(entries.clone(), "a.b"), vec![entries[0].clone()]);
        assert_eq!(found(entries.clone(), "(x)+[y]"), vec![entries[2].clone()]);
    }

    #[test]
    fn a_double_star_does_not_cross_a_line_terminator_but_a_single_star_does() {
        let entries = vec![entry("a\nb", "a\nb")];
        assert!(found(entries.clone(), "a**b").is_empty());
        assert_eq!(found(entries.clone(), "a*b"), entries);
    }

    #[test]
    fn matches_are_anchored_to_the_whole_name_or_path() {
        assert!(found(vec![entry("a.txt.bak", "a.txt.bak")], "*.txt").is_empty());
    }

    #[test]
    fn returns_an_empty_result_when_the_walk_finds_nothing() {
        assert!(found(Vec::new(), "**").is_empty());
        assert!(
            block_on(find_files(&host_with(), "", "**", None))
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn forwards_the_root_and_walk_options() {
        let calls = call_log::<(String, Option<f64>)>();
        let record = calls.clone();
        let mut host = host_with();
        host.read_directory_recursive = Some(Arc::new(move |path, options| {
            record.lock().unwrap().push((
                path.to_string(),
                options.and_then(|options| options.max_depth),
            ));
            return ok(Vec::new());
        }));
        let options = FileWalkOptions {
            max_depth: Some(3.0),
            signal: None,
        };
        block_on(find_files(&host, "root", "*", Some(&options))).unwrap();
        assert_eq!(
            *calls.lock().unwrap(),
            vec![("root".to_string(), Some(3.0))]
        );
    }
}

mod get_file_access_mode_string {
    use super::*;

    #[test]
    fn round_trips_every_mode() {
        for (value, text) in [
            (FileAccessMode::Executable, "executable"),
            (FileAccessMode::Readable, "readable"),
            (FileAccessMode::Writable, "writable"),
        ] {
            assert_eq!(get_file_access_mode_string(value), text);
            assert_eq!(parse_file_access_mode(text), Some(value));
        }
    }
}

mod get_file_base_name {
    use super::*;

    #[test]
    fn returns_the_final_path_segment() {
        assert_eq!(get_file_base_name("a/b.txt"), "b.txt");
    }

    #[test]
    fn ignores_trailing_and_dot_segments_and_keeps_dot_dot() {
        assert_eq!(get_file_base_name("/a/b/"), "b");
        assert_eq!(get_file_base_name("a/."), "a");
        assert_eq!(get_file_base_name("a/.."), "..");
        assert_eq!(get_file_base_name(""), "");
        assert_eq!(get_file_base_name("/"), "");
    }
}

mod get_file_directory_name {
    use super::*;

    #[test]
    fn returns_every_segment_before_the_last() {
        assert_eq!(get_file_directory_name("a/b.txt"), "a");
    }

    #[test]
    fn drops_the_root_and_empty_segments_as_the_source_does() {
        assert_eq!(get_file_directory_name("/a/b/c.txt"), "a/b");
        assert_eq!(get_file_directory_name("a//b"), "a");
        assert_eq!(get_file_directory_name("b.txt"), "");
        assert_eq!(get_file_directory_name("/b.txt"), "");
    }
}

mod get_file_extension_name {
    use super::*;

    #[test]
    fn returns_the_final_extension() {
        assert_eq!(get_file_extension_name("a/b.txt"), ".txt");
    }

    #[test]
    fn reads_only_the_base_name_and_skips_a_leading_dot() {
        assert_eq!(get_file_extension_name("a/b.tar.gz"), ".gz");
        assert_eq!(get_file_extension_name("a/.bashrc"), "");
        assert_eq!(get_file_extension_name("a.d/b"), "");
        assert_eq!(get_file_extension_name("a/b."), ".");
    }
}

mod get_file_permissions {
    use super::*;

    #[test]
    fn owns_the_documented_absence_result() {
        assert_eq!(block_on(get_file_permissions("a")), Ok(None));
    }
}

mod get_file_real_path {
    use super::*;

    #[test]
    fn owns_the_documented_absence_result() {
        assert_eq!(block_on(get_file_real_path("a")), Ok(None));
    }
}

mod get_file_system_path {
    use super::*;

    #[test]
    fn owns_the_documented_absence_result() {
        assert_eq!(get_file_system_path(FileSystemPathKind::Home), "");
        assert_eq!(get_file_system_path(FileSystemPathKind::Temp), "");
    }
}

mod get_file_system_path_kind_string {
    use super::*;

    #[test]
    fn round_trips_every_kind() {
        for (value, text) in [
            (FileSystemPathKind::AppData, "appData"),
            (FileSystemPathKind::Cache, "cache"),
            (FileSystemPathKind::Desktop, "desktop"),
            (FileSystemPathKind::Documents, "documents"),
            (FileSystemPathKind::Downloads, "downloads"),
            (FileSystemPathKind::Home, "home"),
            (FileSystemPathKind::Temp, "temp"),
        ] {
            assert_eq!(get_file_system_path_kind_string(value), text);
            assert_eq!(parse_file_system_path_kind(text), Some(value));
        }
    }
}

mod get_file_system_usage {
    use super::*;

    #[test]
    fn returns_null_when_the_provider_omits_quota_estimation() {
        assert_eq!(block_on(get_file_system_usage(&host_with())), Ok(None));
    }

    #[test]
    fn returns_the_provider_estimate() {
        let mut host = host_with();
        let usage = FileSystemUsage {
            used_bytes: 10,
            quota_bytes: 100,
        };
        host.get_file_system_usage = Some(Arc::new(move || ok(Some(usage))));
        assert_eq!(block_on(get_file_system_usage(&host)), Ok(Some(usage)));
    }
}

mod get_file_watch_event_type_string {
    use super::*;

    #[test]
    fn round_trips_every_event_type() {
        for (value, text) in [
            (FileWatchEventType::Created, "created"),
            (FileWatchEventType::Deleted, "deleted"),
            (FileWatchEventType::Modified, "modified"),
        ] {
            assert_eq!(get_file_watch_event_type_string(value), text);
            assert_eq!(parse_file_watch_event_type(text), Some(value));
        }
    }
}

mod is_absolute_file_path {
    use super::*;

    #[test]
    fn recognizes_posix_and_windows_roots() {
        assert!(is_absolute_file_path("/a"));
        assert!(is_absolute_file_path("C:/a"));
        assert!(!is_absolute_file_path("a"));
    }

    #[test]
    fn needs_a_letter_then_colon_for_a_drive() {
        assert!(is_absolute_file_path("z:"));
        assert!(!is_absolute_file_path("1:/a"));
        assert!(!is_absolute_file_path("C"));
        assert!(!is_absolute_file_path(""));
        assert!(!is_absolute_file_path("\\\\server"));
    }
}

mod join_file_path {
    use super::*;

    #[test]
    fn joins_and_normalizes_separators() {
        assert_eq!(join_file_path(&["/a", ".", "b"]), "/a/b");
    }

    #[test]
    fn resolves_a_dot_dot_segment_against_the_segment_before_it() {
        assert_eq!(join_file_path(&["/a/b", "../c"]), "/a/c");
        assert_eq!(join_file_path(&["a", "b", "..", "c"]), "a/c");
    }

    #[test]
    fn agrees_with_normalize_file_path_so_a_path_has_one_spelling() {
        for parts in [
            vec!["/a/b", "../c"],
            vec!["a", "..", "..", "b"],
            vec!["/a", "..", ".."],
            vec!["a", ".."],
        ] {
            assert_eq!(
                join_file_path(&parts),
                normalize_file_path(&parts.join("/"))
            );
        }
    }

    #[test]
    fn takes_absoluteness_from_the_first_segment_only() {
        assert_eq!(join_file_path(&["a", "/b"]), "a/b");
        assert_eq!(join_file_path(&[]), ".");
    }
}

mod make_directory {
    use super::*;

    #[test]
    fn returns_false_when_omitted() {
        assert_eq!(block_on(make_directory(&host_with(), "a")), Ok(false));
    }

    #[test]
    fn forwards_the_path() {
        let calls = call_log::<String>();
        let record = calls.clone();
        let mut host = host_with();
        host.make_directory = Some(Arc::new(move |path| {
            record.lock().unwrap().push(path.to_string());
            return ok(true);
        }));
        assert_eq!(block_on(make_directory(&host, "a")), Ok(true));
        assert_eq!(*calls.lock().unwrap(), vec!["a".to_string()]);
    }
}

mod normalize_file_path {
    use super::*;

    #[test]
    fn removes_empty_and_dot_segments() {
        assert_eq!(normalize_file_path("/a//./b"), "/a/b");
    }

    #[test]
    fn resolves_a_dot_dot_segment_against_the_segment_before_it() {
        assert_eq!(normalize_file_path("/a/b/../c"), "/a/c");
        assert_eq!(normalize_file_path("a/b/../../c"), "c");
        assert_eq!(normalize_file_path("/a/b/.."), "/a");
    }

    #[test]
    fn clamps_an_absolute_path_at_the_root() {
        assert_eq!(normalize_file_path("/.."), "/");
        assert_eq!(normalize_file_path("/a/../../b"), "/b");
    }

    #[test]
    fn keeps_a_leading_dot_dot_on_a_relative_path() {
        assert_eq!(normalize_file_path(".."), "..");
        assert_eq!(normalize_file_path("a/../../b"), "../b");
        assert_eq!(normalize_file_path("a/../../.."), "../..");
    }

    #[test]
    fn resolves_a_relative_path_that_cancels_out_to_dot() {
        assert_eq!(normalize_file_path("a/.."), ".");
        assert_eq!(normalize_file_path("."), ".");
    }

    #[test]
    fn treats_a_drive_spelling_as_relative_and_drops_a_trailing_slash() {
        assert_eq!(normalize_file_path("C:/a/../b"), "C:/b");
        assert_eq!(normalize_file_path("C:/.."), ".");
        assert_eq!(normalize_file_path("/a/b/"), "/a/b");
        assert_eq!(normalize_file_path(""), ".");
        assert_eq!(normalize_file_path("/"), "/");
    }
}

mod open_file_read_stream {
    use super::*;

    #[test]
    fn returns_null_when_omitted() {
        assert!(
            block_on(open_file_read_stream(&host_with(), "a", None))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn rejects_pre_aborted_opens_with_the_reason() {
        let why = reason("cancel open");
        let controller = aborted_controller(&why);
        assert!(same_reason(
            &rejection_reason(open_file_read_stream(
                &host_with(),
                "a",
                Some(&controller.signal)
            )),
            &why
        ));
    }
}

mod open_file_write_stream {
    use super::*;

    #[test]
    fn returns_null_when_omitted() {
        assert!(
            block_on(open_file_write_stream(&host_with(), "a", None))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn rejects_pre_aborted_opens_with_the_reason() {
        let why = reason("cancel open");
        let controller = aborted_controller(&why);
        assert!(same_reason(
            &rejection_reason(open_file_write_stream(
                &host_with(),
                "a",
                Some(&controller.signal)
            )),
            &why
        ));
    }
}

mod parse_file_access_mode {
    use super::*;

    #[test]
    fn rejects_strings_outside_the_source_union() {
        assert_eq!(parse_file_access_mode("Readable"), None);
        assert_eq!(parse_file_access_mode(""), None);
    }
}

mod parse_file_system_path_kind {
    use super::*;

    #[test]
    fn rejects_strings_outside_the_source_union() {
        assert_eq!(parse_file_system_path_kind("appdata"), None);
        assert_eq!(parse_file_system_path_kind(""), None);
    }
}

mod parse_file_watch_event_type {
    use super::*;

    #[test]
    fn rejects_strings_outside_the_source_union() {
        assert_eq!(parse_file_watch_event_type("renamed"), None);
    }
}

mod read_binary_file {
    use super::*;

    #[test]
    fn preserves_provider_byte_identity() {
        let bytes: Box<[u8]> = Box::new([1, 2]);
        let address = bytes.as_ptr() as usize;
        let held = std::sync::Mutex::new(Some(bytes));
        let mut host = host_with();
        host.read_binary_file = Some(Arc::new(move |_path, _signal| {
            ok(held.lock().unwrap().take())
        }));
        let read = block_on(read_binary_file(&host, "a", None))
            .unwrap()
            .unwrap();
        assert_eq!(read.as_ptr() as usize, address);
        assert_eq!(&read[..], &[1, 2]);
    }

    #[test]
    fn rejects_pre_aborted_reads_without_starting_provider_work() {
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let mut host = host_with();
        host.read_binary_file = Some(Arc::new(move |_path, _signal| {
            count.fetch_add(1, Ordering::SeqCst);
            return ok(Some(Box::new([]) as Box<[u8]>));
        }));
        let why = reason("cancel read");
        let controller = aborted_controller(&why);
        assert!(same_reason(
            &rejection_reason(read_binary_file(&host, "a", Some(&controller.signal))),
            &why
        ));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn returns_null_when_omitted() {
        assert_eq!(
            block_on(read_binary_file(&host_with(), "a", None)),
            Ok(None)
        );
    }

    #[test]
    fn preserves_provider_rejections() {
        let mut host = host_with();
        let failure = flight_entity::FlightError {
            kind: flight_entity::FlightErrorKind::Error,
            message: "denied".to_string(),
        };
        let rejected = failure.clone();
        host.read_binary_file = Some(Arc::new(move |_path, _signal| {
            let rejected = rejected.clone();
            return Box::pin(async move { Err(rejected) });
        }));
        assert_eq!(block_on(read_binary_file(&host, "a", None)), Err(failure));
    }
}

mod read_binary_file_range {
    use super::*;

    #[test]
    fn forwards_the_range() {
        let calls = call_log::<(String, usize, usize, Option<AbortSignal>)>();
        let record = calls.clone();
        let mut host = host_with();
        host.read_binary_file_range = Some(Arc::new(move |path, offset, length, signal| {
            record
                .lock()
                .unwrap()
                .push((path.to_string(), offset, length, signal_state(signal)));
            return ok(Some(Box::new([2u8]) as Box<[u8]>));
        }));
        let controller = create_abort_controller();
        block_on(read_binary_file_range(
            &host,
            "a",
            1,
            1,
            Some(&controller.signal),
        ))
        .unwrap();
        let calls = calls.lock().unwrap();
        assert_eq!((calls[0].0.as_str(), calls[0].1, calls[0].2), ("a", 1, 1));
        assert!(forwarded(&calls[0].3, &controller));
    }

    #[test]
    fn returns_null_when_omitted_and_rejects_when_pre_aborted() {
        assert_eq!(
            block_on(read_binary_file_range(&host_with(), "a", 0, 4, None)),
            Ok(None)
        );
        let why = reason("cancel range");
        let controller = aborted_controller(&why);
        let thrown = rejection_reason(read_binary_file_range(
            &host_with(),
            "a",
            0,
            4,
            Some(&controller.signal),
        ));
        assert!(same_reason(&thrown, &why));
    }
}

mod read_dialog_handle_binary_file {
    use super::*;

    #[test]
    fn uses_retained_handle_operations_when_there_is_no_native_path() {
        let observed = call_log::<Option<AbortSignal>>();
        let record = observed.clone();
        let operations = FileDialogHandleOperations {
            read_binary: Some(Arc::new(move |signal| {
                record.lock().unwrap().push(signal.cloned());
                return Box::pin(async { Ok(Some(Box::new([3u8]) as Box<[u8]>)) });
            })),
            read_text: Some(Arc::new(|_signal| {
                Box::pin(async { Ok(Some("x".to_string())) })
            })),
            write_binary: Some(Arc::new(|_data, _signal| Box::pin(async { Ok(true) }))),
            write_text: Some(Arc::new(|_data, _signal| Box::pin(async { Ok(true) }))),
        };
        let handle =
            create_file_dialog_handle(FileDialogHandleKind::File, "a", None, Some(operations));
        let controller = create_abort_controller();
        let read = block_on(read_dialog_handle_binary_file(
            &host_with(),
            &handle,
            Some(&controller.signal),
        ));
        assert_eq!(read.unwrap().as_deref(), Some(&[3u8][..]));
        assert!(forwarded(&observed.lock().unwrap()[0], &controller));
    }

    #[test]
    fn prefers_the_native_path_over_retained_operations() {
        let make: fn() -> FileDialogHandleOperations = FileDialogHandleOperations::default;
        let mut operations = make();
        operations.read_binary = Some(Arc::new(|_signal| {
            Box::pin(async { Ok(Some(Box::new([9u8]) as Box<[u8]>)) })
        }));
        let handle = create_file_dialog_handle(
            FileDialogHandleKind::File,
            "a",
            Some("/a"),
            Some(operations),
        );
        let calls = call_log::<String>();
        let record = calls.clone();
        let mut host = host_with();
        host.read_binary_file = Some(Arc::new(move |path, _signal| {
            record.lock().unwrap().push(path.to_string());
            return ok(Some(Box::new([1u8]) as Box<[u8]>));
        }));
        let read = block_on(read_dialog_handle_binary_file(&host, &handle, None)).unwrap();
        assert_eq!(read.as_deref(), Some(&[1u8][..]));
        assert_eq!(*calls.lock().unwrap(), vec!["/a".to_string()]);
    }

    #[test]
    fn returns_null_for_an_authority_free_handle_and_rejects_when_pre_aborted() {
        let handle = create_file_dialog_handle(FileDialogHandleKind::File, "a", None, None);
        assert_eq!(
            block_on(read_dialog_handle_binary_file(&host_with(), &handle, None)),
            Ok(None)
        );
        let why = reason("cancel handle read");
        let controller = aborted_controller(&why);
        let thrown = rejection_reason(read_dialog_handle_binary_file(
            &host_with(),
            &handle,
            Some(&controller.signal),
        ));
        assert!(same_reason(&thrown, &why));
    }
}

mod read_dialog_handle_text_file {
    use super::*;

    #[test]
    fn uses_the_passed_host_for_a_native_path() {
        let mut host = host_with();
        host.read_text_file = Some(Arc::new(|path, _signal| {
            ok(Some(format!("text at {path}")))
        }));
        let handle = create_file_dialog_handle(FileDialogHandleKind::File, "a", Some("/a"), None);
        assert_eq!(
            block_on(read_dialog_handle_text_file(&host, &handle, None)),
            Ok(Some("text at /a".to_string()))
        );
    }

    #[test]
    fn uses_retained_handle_operations_without_a_path() {
        let make: fn() -> FileDialogHandleOperations = FileDialogHandleOperations::default;
        let mut operations = make();
        operations.read_text = Some(Arc::new(|_signal| {
            Box::pin(async { Ok(Some("retained".to_string())) })
        }));
        let handle =
            create_file_dialog_handle(FileDialogHandleKind::File, "a", None, Some(operations));
        assert_eq!(
            block_on(read_dialog_handle_text_file(&host_with(), &handle, None)),
            Ok(Some("retained".to_string()))
        );
        let bare = create_file_dialog_handle(FileDialogHandleKind::File, "a", None, None);
        assert_eq!(
            block_on(read_dialog_handle_text_file(&host_with(), &bare, None)),
            Ok(None)
        );
    }

    #[test]
    fn rejects_when_pre_aborted() {
        let handle = create_file_dialog_handle(FileDialogHandleKind::File, "a", Some("/a"), None);
        let why = reason("cancel text read");
        let controller = aborted_controller(&why);
        let thrown = rejection_reason(read_dialog_handle_text_file(
            &host_with(),
            &handle,
            Some(&controller.signal),
        ));
        assert!(same_reason(&thrown, &why));
    }
}

mod read_directory {
    use super::*;

    #[test]
    fn returns_an_owned_empty_result_when_omitted() {
        assert_eq!(
            block_on(read_directory(&host_with(), "a", None)),
            Ok(Vec::new())
        );
    }

    #[test]
    fn returns_provider_entries_and_rejects_when_pre_aborted() {
        let mut host = host_with();
        host.read_directory = Some(Arc::new(|path, _signal| {
            ok(vec![entry("x", &format!("{path}/x"))])
        }));
        assert_eq!(
            block_on(read_directory(&host, "a", None)),
            Ok(vec![entry("x", "a/x")])
        );
        let why = reason("cancel list");
        let controller = aborted_controller(&why);
        assert!(same_reason(
            &rejection_reason(read_directory(&host, "a", Some(&controller.signal))),
            &why
        ));
    }
}

mod read_directory_recursive {
    use super::*;

    #[test]
    fn forwards_walk_options() {
        let calls = call_log::<(String, Option<Option<f64>>)>();
        let record = calls.clone();
        let mut host = host_with();
        host.read_directory_recursive = Some(Arc::new(move |path, options| {
            record
                .lock()
                .unwrap()
                .push((path.to_string(), options.map(|options| options.max_depth)));
            return ok(Vec::new());
        }));
        let options = FileWalkOptions {
            max_depth: Some(2.0),
            signal: None,
        };
        block_on(read_directory_recursive(&host, "a", Some(&options))).unwrap();
        block_on(read_directory_recursive(&host, "b", None)).unwrap();
        assert_eq!(
            *calls.lock().unwrap(),
            vec![("a".to_string(), Some(Some(2.0))), ("b".to_string(), None)]
        );
    }

    #[test]
    fn rejects_when_the_option_signal_is_pre_aborted() {
        let why = reason("cancel walk");
        let controller = aborted_controller(&why);
        let options = FileWalkOptions {
            max_depth: None,
            signal: Some(controller.signal.clone()),
        };
        assert!(same_reason(
            &rejection_reason(read_directory_recursive(&host_with(), "a", Some(&options))),
            &why
        ));
    }

    #[test]
    fn returns_an_empty_result_when_omitted() {
        assert_eq!(
            block_on(read_directory_recursive(&host_with(), "a", None)),
            Ok(Vec::new())
        );
    }
}

mod read_file_symlink {
    use super::*;

    #[test]
    fn owns_the_documented_absence_result() {
        assert_eq!(block_on(read_file_symlink("a")), Ok(None));
    }
}

mod read_text_file {
    use super::*;

    #[test]
    fn never_crosses_between_two_explicit_hosts() {
        let mut first = host_with();
        first.read_text_file = Some(Arc::new(|_path, _signal| ok(Some("first".to_string()))));
        let mut second = host_with();
        second.read_text_file = Some(Arc::new(|_path, _signal| ok(Some("second".to_string()))));
        assert_eq!(
            block_on(read_text_file(&first, "a", None)),
            Ok(Some("first".to_string()))
        );
        assert_eq!(
            block_on(read_text_file(&second, "a", None)),
            Ok(Some("second".to_string()))
        );
    }

    #[test]
    fn returns_null_when_omitted_and_rejects_when_pre_aborted() {
        assert_eq!(block_on(read_text_file(&host_with(), "a", None)), Ok(None));
        let why = reason("cancel text");
        let controller = aborted_controller(&why);
        assert!(same_reason(
            &rejection_reason(read_text_file(&host_with(), "a", Some(&controller.signal))),
            &why
        ));
    }
}

mod remove_directory {
    use super::*;

    #[test]
    fn forwards_recursive_intent() {
        let calls = call_log::<(String, Option<bool>)>();
        let record = calls.clone();
        let mut host = host_with();
        host.remove_directory = Some(Arc::new(move |path, recursive| {
            record.lock().unwrap().push((path.to_string(), recursive));
            return ok(true);
        }));
        block_on(remove_directory(&host, "a", Some(true))).unwrap();
        block_on(remove_directory(&host, "b", None)).unwrap();
        assert_eq!(
            *calls.lock().unwrap(),
            vec![("a".to_string(), Some(true)), ("b".to_string(), None)]
        );
        assert_eq!(
            block_on(remove_directory(&host_with(), "a", None)),
            Ok(false)
        );
    }
}

mod remove_file {
    use super::*;

    #[test]
    fn returns_false_when_omitted() {
        assert_eq!(block_on(remove_file(&host_with(), "a")), Ok(false));
    }

    #[test]
    fn forwards_the_path() {
        let mut host = host_with();
        host.remove_file = Some(Arc::new(|path| ok(path == "a")));
        assert_eq!(block_on(remove_file(&host, "a")), Ok(true));
    }
}

mod rename_file {
    use super::*;

    #[test]
    fn forwards_both_paths() {
        let calls = call_log::<(String, String)>();
        let record = calls.clone();
        let mut host = host_with();
        host.rename = Some(Arc::new(move |from, to| {
            record
                .lock()
                .unwrap()
                .push((from.to_string(), to.to_string()));
            return ok(true);
        }));
        block_on(rename_file(&host, "a", "b")).unwrap();
        assert_eq!(
            *calls.lock().unwrap(),
            vec![("a".to_string(), "b".to_string())]
        );
        assert_eq!(block_on(rename_file(&host_with(), "a", "b")), Ok(false));
    }
}

mod set_file_permissions {
    use super::*;

    #[test]
    fn owns_the_documented_absence_result() {
        let permissions = FilePermissions {
            executable: false,
            readable: true,
            writable: true,
        };
        assert_eq!(block_on(set_file_permissions("a", &permissions)), Ok(false));
    }
}

mod stat_file {
    use super::*;

    #[test]
    fn returns_null_when_omitted() {
        assert_eq!(block_on(stat_file(&host_with(), "a")), Ok(None));
    }

    #[test]
    fn returns_the_provider_stat() {
        let stat = FileStat {
            size: 5,
            is_directory: false,
            modified_time: 2.0,
            created_time: 1.0,
            is_symlink: false,
        };
        let mut host = host_with();
        host.stat_file = Some(Arc::new(move |_path| ok(Some(stat))));
        assert_eq!(block_on(stat_file(&host, "a")), Ok(Some(stat)));
    }
}

mod watch_path {
    use super::*;

    #[test]
    fn owns_an_inert_unsubscribe_when_no_real_provider_exists() {
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let unsubscribe = watch_path(
            "a",
            Arc::new(move |_event| {
                count.fetch_add(1, Ordering::SeqCst);
            }),
        );
        unsubscribe();
        unsubscribe();
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}

mod write_binary_file {
    use super::*;

    #[test]
    fn forwards_bytes_without_mutation() {
        let calls = call_log::<(String, usize, Vec<u8>, Option<AbortSignal>)>();
        let record = calls.clone();
        let mut host = host_with();
        host.write_binary_file = Some(Arc::new(move |path, data, signal| {
            record.lock().unwrap().push((
                path.to_string(),
                data.as_ptr() as usize,
                data.to_vec(),
                signal_state(signal),
            ));
            return ok(true);
        }));
        let bytes = [1u8];
        let controller = create_abort_controller();
        block_on(write_binary_file(
            &host,
            "a",
            &bytes,
            Some(&controller.signal),
        ))
        .unwrap();
        let calls = calls.lock().unwrap();
        assert_eq!(calls[0].0, "a");
        assert_eq!(calls[0].1, bytes.as_ptr() as usize);
        assert_eq!(calls[0].2, vec![1]);
        assert!(forwarded(&calls[0].3, &controller));
    }

    #[test]
    fn returns_false_when_omitted_and_rejects_when_pre_aborted() {
        assert_eq!(
            block_on(write_binary_file(&host_with(), "a", &[1], None)),
            Ok(false)
        );
        let why = reason("cancel write");
        let controller = aborted_controller(&why);
        assert!(same_reason(
            &rejection_reason(write_binary_file(
                &host_with(),
                "a",
                &[1],
                Some(&controller.signal)
            )),
            &why
        ));
    }
}

mod write_dialog_handle_binary_file {
    use super::*;

    #[test]
    fn returns_false_for_an_authority_free_handle() {
        let handle = create_file_dialog_handle(FileDialogHandleKind::File, "a", None, None);
        assert_eq!(
            block_on(write_dialog_handle_binary_file(
                &host_with(),
                &handle,
                &[],
                None
            )),
            Ok(false)
        );
    }

    #[test]
    fn writes_through_retained_operations_or_the_native_path() {
        let written = call_log::<Vec<u8>>();
        let record = written.clone();
        let make: fn() -> FileDialogHandleOperations = FileDialogHandleOperations::default;
        let mut operations = make();
        operations.write_binary = Some(Arc::new(move |data, _signal| {
            record.lock().unwrap().push(data.to_vec());
            return Box::pin(async { Ok(true) });
        }));
        let retained =
            create_file_dialog_handle(FileDialogHandleKind::File, "a", None, Some(operations));
        assert_eq!(
            block_on(write_dialog_handle_binary_file(
                &host_with(),
                &retained,
                &[7],
                None
            )),
            Ok(true)
        );
        assert_eq!(*written.lock().unwrap(), vec![vec![7]]);
        let pathed = create_file_dialog_handle(FileDialogHandleKind::File, "a", Some("/p"), None);
        let mut host = host_with();
        host.write_binary_file = Some(Arc::new(|path, _data, _signal| ok(path == "/p")));
        assert_eq!(
            block_on(write_dialog_handle_binary_file(&host, &pathed, &[7], None)),
            Ok(true)
        );
    }

    #[test]
    fn rejects_when_pre_aborted() {
        let handle = create_file_dialog_handle(FileDialogHandleKind::File, "a", None, None);
        let why = reason("cancel handle write");
        let controller = aborted_controller(&why);
        let thrown = rejection_reason(write_dialog_handle_binary_file(
            &host_with(),
            &handle,
            &[],
            Some(&controller.signal),
        ));
        assert!(same_reason(&thrown, &why));
    }
}

mod write_dialog_handle_text_file {
    use super::*;

    #[test]
    fn uses_the_passed_host_for_a_native_path() {
        let calls = call_log::<(String, String, Option<AbortSignal>)>();
        let record = calls.clone();
        let mut host = host_with();
        host.write_text_file = Some(Arc::new(move |path, data, signal| {
            record
                .lock()
                .unwrap()
                .push((path.to_string(), data.to_string(), signal_state(signal)));
            return ok(true);
        }));
        let handle = create_file_dialog_handle(FileDialogHandleKind::File, "a", Some("/a"), None);
        let controller = create_abort_controller();
        assert_eq!(
            block_on(write_dialog_handle_text_file(
                &host,
                &handle,
                "x",
                Some(&controller.signal)
            )),
            Ok(true)
        );
        let calls = calls.lock().unwrap();
        assert_eq!((calls[0].0.as_str(), calls[0].1.as_str()), ("/a", "x"));
        assert!(forwarded(&calls[0].2, &controller));
    }

    #[test]
    fn uses_retained_operations_without_a_path() {
        let make: fn() -> FileDialogHandleOperations = FileDialogHandleOperations::default;
        let mut operations = make();
        operations.write_text = Some(Arc::new(|data, _signal| {
            let wrote = data == "x";
            return Box::pin(async move { Ok(wrote) });
        }));
        let handle =
            create_file_dialog_handle(FileDialogHandleKind::File, "a", None, Some(operations));
        assert_eq!(
            block_on(write_dialog_handle_text_file(
                &host_with(),
                &handle,
                "x",
                None
            )),
            Ok(true)
        );
        let bare = create_file_dialog_handle(FileDialogHandleKind::File, "a", None, None);
        assert_eq!(
            block_on(write_dialog_handle_text_file(
                &host_with(),
                &bare,
                "x",
                None
            )),
            Ok(false)
        );
    }
}

mod write_file_atomic {
    use super::*;

    #[test]
    fn returns_false_when_the_provider_omits_atomic_writes() {
        let data = FileAtomicWriteData::Text(FileAtomicWriteText { data: "x" });
        assert_eq!(
            block_on(write_file_atomic(&host_with(), "a", data, None)),
            Ok(false)
        );
    }

    #[test]
    fn forwards_either_data_form_unchanged() {
        let calls = call_log::<String>();
        let record = calls.clone();
        let mut host = host_with();
        host.write_file_atomic = Some(Arc::new(move |path, data, _signal| {
            let described = match data {
                FileAtomicWriteData::Bytes(bytes) => format!("{path} bytes {:?}", bytes.data),
                FileAtomicWriteData::Text(text) => format!("{path} text {}", text.data),
            };
            record.lock().unwrap().push(described);
            return ok(true);
        }));
        block_on(write_file_atomic(
            &host,
            "a",
            FileAtomicWriteData::Bytes(FileAtomicWriteBytes { data: &[1, 2] }),
            None,
        ))
        .unwrap();
        block_on(write_file_atomic(
            &host,
            "b",
            FileAtomicWriteData::Text(FileAtomicWriteText { data: "x" }),
            None,
        ))
        .unwrap();
        assert_eq!(
            *calls.lock().unwrap(),
            vec!["a bytes [1, 2]".to_string(), "b text x".to_string()]
        );
    }

    #[test]
    fn rejects_when_pre_aborted() {
        let why = reason("cancel atomic");
        let controller = aborted_controller(&why);
        let data = FileAtomicWriteData::Text(FileAtomicWriteText { data: "x" });
        assert!(same_reason(
            &rejection_reason(write_file_atomic(
                &host_with(),
                "a",
                data,
                Some(&controller.signal)
            )),
            &why
        ));
    }
}

mod write_text_file {
    use super::*;

    #[test]
    fn forwards_path_and_text() {
        let calls = call_log::<(String, String, Option<AbortSignal>)>();
        let record = calls.clone();
        let mut host = host_with();
        host.write_text_file = Some(Arc::new(move |path, data, signal| {
            record
                .lock()
                .unwrap()
                .push((path.to_string(), data.to_string(), signal_state(signal)));
            return ok(true);
        }));
        block_on(write_text_file(&host, "a", "x", None)).unwrap();
        let calls = calls.lock().unwrap();
        assert_eq!((calls[0].0.as_str(), calls[0].1.as_str()), ("a", "x"));
        assert!(calls[0].2.is_none());
    }

    #[test]
    fn returns_false_when_omitted_and_rejects_when_pre_aborted() {
        assert_eq!(
            block_on(write_text_file(&host_with(), "a", "x", None)),
            Ok(false)
        );
        let why = reason("cancel text write");
        let controller = aborted_controller(&why);
        assert!(same_reason(
            &rejection_reason(write_text_file(
                &host_with(),
                "a",
                "x",
                Some(&controller.signal)
            )),
            &why
        ));
    }
}
