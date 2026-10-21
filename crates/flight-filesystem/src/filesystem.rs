use std::future::ready;
use std::sync::Arc;

use flight_dialog::{FileDialogHandle, get_file_dialog_handle_operations};
use flight_entity::{Ref, Uint8Array};
use flight_stream::{
    AbortSignal, ReadableStream, WritableStream, get_abort_signal_reason, is_abort_signal_aborted,
};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::future::{Future, ready};
    use std::sync::Arc;
    use std::task::{Context, Poll, Waker};

    use flight_dialog::{FileDialogHandle, FileDialogHandleKind, create_file_dialog_handle};
    use flight_entity::Ref;

    use crate::contract::*;

    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
        }
    }

    fn done<T: Send + 'static>(value: T) -> FileSystemProviderFuture<T> {
        return Box::pin(ready(Ok(value)));
    }

    fn test_handle() -> Ref<FileDialogHandle> {
        return create_file_dialog_handle(FileDialogHandleKind::File, "a", Some("/a"), None);
    }

    // A host answering every member with a value derived from its arguments.
    fn test_host() -> HostFileSystemCapability {
        return HostFileSystemCapability {
            provider: Arc::new(()),
            append_text_file: Some(Arc::new(|path, data, _signal| {
                done(path.len() < data.len())
            })),
            can_access_file: Some(Arc::new(|_path, mode| {
                done(mode == FileAccessMode::Readable)
            })),
            copy: Some(Arc::new(|from, to| done(from != to))),
            directory_exists: Some(Arc::new(|path| done(path == "a"))),
            file_exists: Some(Arc::new(|path| done(path == "a"))),
            get_file_system_usage: Some(Arc::new(|| {
                done(Some(FileSystemUsage {
                    used_bytes: 1,
                    quota_bytes: 2,
                }))
            })),
            make_directory: Some(Arc::new(|path| done(path == "a"))),
            open_file_read_stream: Some(Arc::new(|_path, _signal| done(None))),
            open_file_write_stream: Some(Arc::new(|_path, _signal| done(None))),
            read_binary_file: Some(Arc::new(|path, _signal| {
                done(Some(path.as_bytes().to_vec().into_boxed_slice()))
            })),
            read_binary_file_range: Some(Arc::new(|_path, offset, length, _signal| {
                done(Some(vec![offset as u8, length as u8].into_boxed_slice()))
            })),
            read_directory: Some(Arc::new(|path, _signal| {
                done(vec![FileEntry {
                    name: "x".to_string(),
                    path: format!("{path}/x"),
                    is_directory: false,
                }])
            })),
            read_directory_recursive: Some(Arc::new(|path, _options| {
                done(vec![FileEntry {
                    name: "y.bin".to_string(),
                    path: format!("{path}/y.bin"),
                    is_directory: false,
                }])
            })),
            read_text_file: Some(Arc::new(|path, _signal| done(Some(format!("text {path}"))))),
            remove_directory: Some(Arc::new(|_path, recursive| done(recursive == Some(true)))),
            remove_file: Some(Arc::new(|path| done(path == "a"))),
            rename: Some(Arc::new(|from, to| done(from != to))),
            stat_file: Some(Arc::new(|path| {
                done(Some(FileStat {
                    size: path.len() as usize,
                    is_directory: false,
                    modified_time: 2.0,
                    created_time: 1.0,
                    is_symlink: false,
                }))
            })),
            write_binary_file: Some(Arc::new(|_path, data, _signal| done(data.len() == 2))),
            write_file_atomic: Some(Arc::new(|_path, data, _signal| {
                done(matches!(data, FileAtomicWriteData::Text(_)))
            })),
            write_text_file: Some(Arc::new(|path, data, _signal| done(path != data))),
        };
    }

    #[test]
    fn hostfilesystemcapability_append_text_file_matches_append_text_file() {
        let s = test_host();
        let ra = block_on(s.append_text_file("a", "x", None));
        let rb = block_on(append_text_file(&s, "a", "x", None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_can_access_file_matches_can_access_file() {
        let s = test_host();
        let ra = block_on(s.can_access_file("a", FileAccessMode::Readable));
        let rb = block_on(can_access_file(&s, "a", FileAccessMode::Readable));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_copy_file_matches_copy_file() {
        let s = test_host();
        let ra = block_on(s.copy_file("a", "b"));
        let rb = block_on(copy_file(&s, "a", "b"));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_directory_exists_matches_directory_exists() {
        let s = test_host();
        let ra = block_on(s.directory_exists("a"));
        let rb = block_on(directory_exists(&s, "a"));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_file_exists_matches_file_exists() {
        let s = test_host();
        let ra = block_on(s.file_exists("a"));
        let rb = block_on(file_exists(&s, "a"));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_find_files_matches_find_files() {
        let s = test_host();
        let ra = block_on(s.find_files("r", "**", None));
        let rb = block_on(find_files(&s, "r", "**", None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_get_file_system_usage_matches_get_file_system_usage() {
        let s = test_host();
        let ra = block_on(s.get_file_system_usage());
        let rb = block_on(get_file_system_usage(&s));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_make_directory_matches_make_directory() {
        let s = test_host();
        let ra = block_on(s.make_directory("a"));
        let rb = block_on(make_directory(&s, "a"));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_open_file_read_stream_matches_open_file_read_stream() {
        let s = test_host();
        let ra = block_on(s.open_file_read_stream("a", None)).map(|stream| stream.is_some());
        let rb = block_on(open_file_read_stream(&s, "a", None)).map(|stream| stream.is_some());
        assert_eq!(ra, rb);
    }

    #[test]
    fn hostfilesystemcapability_open_file_write_stream_matches_open_file_write_stream() {
        let s = test_host();
        let ra = block_on(s.open_file_write_stream("a", None)).map(|stream| stream.is_some());
        let rb = block_on(open_file_write_stream(&s, "a", None)).map(|stream| stream.is_some());
        assert_eq!(ra, rb);
    }

    #[test]
    fn hostfilesystemcapability_read_binary_file_matches_read_binary_file() {
        let s = test_host();
        let ra = block_on(s.read_binary_file("a", None));
        let rb = block_on(read_binary_file(&s, "a", None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_read_binary_file_range_matches_read_binary_file_range() {
        let s = test_host();
        let ra = block_on(s.read_binary_file_range("a", 1, 2, None));
        let rb = block_on(read_binary_file_range(&s, "a", 1, 2, None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_read_dialog_handle_binary_file_matches_read_dialog_handle_binary_file()
     {
        let s = test_host();
        let ra = block_on(s.read_dialog_handle_binary_file(&test_handle(), None));
        let rb = block_on(read_dialog_handle_binary_file(&s, &test_handle(), None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_read_dialog_handle_text_file_matches_read_dialog_handle_text_file()
    {
        let s = test_host();
        let ra = block_on(s.read_dialog_handle_text_file(&test_handle(), None));
        let rb = block_on(read_dialog_handle_text_file(&s, &test_handle(), None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_read_directory_matches_read_directory() {
        let s = test_host();
        let ra = block_on(s.read_directory("a", None));
        let rb = block_on(read_directory(&s, "a", None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_read_directory_recursive_matches_read_directory_recursive() {
        let s = test_host();
        let ra = block_on(s.read_directory_recursive("a", None));
        let rb = block_on(read_directory_recursive(&s, "a", None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_read_text_file_matches_read_text_file() {
        let s = test_host();
        let ra = block_on(s.read_text_file("a", None));
        let rb = block_on(read_text_file(&s, "a", None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_remove_directory_matches_remove_directory() {
        let s = test_host();
        let ra = block_on(s.remove_directory("a", Some(true)));
        let rb = block_on(remove_directory(&s, "a", Some(true)));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_remove_file_matches_remove_file() {
        let s = test_host();
        let ra = block_on(s.remove_file("a"));
        let rb = block_on(remove_file(&s, "a"));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_rename_file_matches_rename_file() {
        let s = test_host();
        let ra = block_on(s.rename_file("a", "b"));
        let rb = block_on(rename_file(&s, "a", "b"));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_stat_file_matches_stat_file() {
        let s = test_host();
        let ra = block_on(s.stat_file("a"));
        let rb = block_on(stat_file(&s, "a"));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_write_binary_file_matches_write_binary_file() {
        let s = test_host();
        let ra = block_on(s.write_binary_file("a", &[1, 2], None));
        let rb = block_on(write_binary_file(&s, "a", &[1, 2], None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_write_dialog_handle_binary_file_matches_write_dialog_handle_binary_file()
     {
        let s = test_host();
        let ra = block_on(s.write_dialog_handle_binary_file(&test_handle(), &[1, 2], None));
        let rb = block_on(write_dialog_handle_binary_file(
            &s,
            &test_handle(),
            &[1, 2],
            None,
        ));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_write_dialog_handle_text_file_matches_write_dialog_handle_text_file()
     {
        let s = test_host();
        let ra = block_on(s.write_dialog_handle_text_file(&test_handle(), "x", None));
        let rb = block_on(write_dialog_handle_text_file(&s, &test_handle(), "x", None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_write_file_atomic_matches_write_file_atomic() {
        let s = test_host();
        let ra = block_on(s.write_file_atomic(
            "a",
            FileAtomicWriteData::Text(FileAtomicWriteText { data: "x" }),
            None,
        ));
        let rb = block_on(write_file_atomic(
            &s,
            "a",
            FileAtomicWriteData::Text(FileAtomicWriteText { data: "x" }),
            None,
        ));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn hostfilesystemcapability_write_text_file_matches_write_text_file() {
        let s = test_host();
        let ra = block_on(s.write_text_file("a", "x", None));
        let rb = block_on(write_text_file(&s, "a", "x", None));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

/// One token of a compiled glob: the source's `globToRegExp` output, matched over UTF-16 code units.
#[derive(Clone, Copy, PartialEq)]
enum GlobToken {
    // `**` -> `.*`: any run of code units except JS line terminators.
    AnyRun,
    // `*` -> `[^/]*`.
    AnySegmentRun,
    // `?` -> `[^/]`.
    AnySegmentUnit,
    Literal(u16),
}

/// Symlinks are outside the honest host-provider surface until a real provider exists.
pub fn create_file_symlink(_target: &str, _link_path: &str) -> FileSystemProviderFuture<bool> {
    return resolved(false);
}

pub fn append_text_file(
    host_file_system: &HostFileSystemCapability,
    path: &str,
    data: &str,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<bool> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let Some(append) = &host_file_system.append_text_file else {
        return resolved(false);
    };
    return append(path, data, signal);
}

pub fn can_access_file(
    host_file_system: &HostFileSystemCapability,
    path: &str,
    mode: FileAccessMode,
) -> FileSystemProviderFuture<bool> {
    return match &host_file_system.can_access_file {
        Some(can_access) => can_access(path, mode),
        None => resolved(false),
    };
}

// The source's globToRegExp: `**` -> `.*` (consuming one following `/`), `*` -> `[^/]*`, `?` -> `[^/]`,
// and every other code unit literal (the source escapes the regex specials, so they match themselves).
fn compile_glob(pattern: &str) -> Vec<GlobToken> {
    let units: Vec<u16> = pattern.encode_utf16().collect();
    let mut tokens = Vec::new();
    let mut i = 0;
    while i < units.len() {
        let unit = units[i];
        if unit == u16::from(b'*') {
            if units.get(i + 1) == Some(&u16::from(b'*')) {
                tokens.push(GlobToken::AnyRun);
                i += 1;
                if units.get(i + 1) == Some(&u16::from(b'/')) {
                    i += 1;
                }
            } else {
                tokens.push(GlobToken::AnySegmentRun);
            }
        } else if unit == u16::from(b'?') {
            tokens.push(GlobToken::AnySegmentUnit);
        } else {
            tokens.push(GlobToken::Literal(unit));
        }
        i += 1;
    }
    return tokens;
}

pub fn copy_file(
    host_file_system: &HostFileSystemCapability,
    from: &str,
    to: &str,
) -> FileSystemProviderFuture<bool> {
    return match &host_file_system.copy {
        Some(copy) => copy(from, to),
        None => resolved(false),
    };
}

pub fn directory_exists(
    host_file_system: &HostFileSystemCapability,
    path: &str,
) -> FileSystemProviderFuture<bool> {
    return match &host_file_system.directory_exists {
        Some(exists) => exists(path),
        None => resolved(false),
    };
}

pub fn file_exists(
    host_file_system: &HostFileSystemCapability,
    path: &str,
) -> FileSystemProviderFuture<bool> {
    return match &host_file_system.file_exists {
        Some(exists) => exists(path),
        None => resolved(false),
    };
}

/// The recursive walk's entries whose name or path matches `pattern`: `**` spans segments (and a
/// following `/` is optional), `*` and `?` stay within one segment, and every other character is
/// literal.
pub fn find_files(
    host_file_system: &HostFileSystemCapability,
    root_path: &str,
    pattern: &str,
    options: Option<&FileWalkOptions>,
) -> FileSystemProviderFuture<Vec<FileEntry>> {
    let walk = read_directory_recursive(host_file_system, root_path, options);
    let tokens = compile_glob(pattern);
    return Box::pin(async move {
        let all = walk.await?;
        if all.is_empty() {
            return Ok(Vec::new());
        }
        return Ok(all
            .into_iter()
            .filter(|entry| {
                glob_matches(&tokens, &entry.name) || glob_matches(&tokens, &entry.path)
            })
            .collect());
    });
}

fn format_resolved_path(segments: &[String], absolute: bool) -> String {
    if absolute {
        return format!("/{}", segments.join("/"));
    }
    if segments.is_empty() {
        return ".".to_string();
    }
    return segments.join("/");
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS canAccessFile mode string union; the TS package exports no get_/parse_ free functions
pub fn get_file_access_mode_string(value: FileAccessMode) -> &'static str {
    return match value {
        FileAccessMode::Executable => "executable",
        FileAccessMode::Readable => "readable",
        FileAccessMode::Writable => "writable",
    };
}

/// The final path segment, or `""` when there is none.
pub fn get_file_base_name(path: &str) -> String {
    return split_path(path)
        .last()
        .map(|segment| segment.to_string())
        .unwrap_or_default();
}

/// Every segment before the last, joined by `/` (a leading root is not kept, as in the source); `""`
/// for one segment or none.
pub fn get_file_directory_name(path: &str) -> String {
    let segments = split_path(path);
    if segments.len() <= 1 {
        return String::new();
    }
    return segments[..segments.len() - 1].join("/");
}

/// The base name's final extension including its dot, or `""` when the base name has no dot after its
/// first character.
pub fn get_file_extension_name(path: &str) -> String {
    let base = get_file_base_name(path);
    return match base.rfind('.') {
        Some(dot) if dot > 0 => base[dot..].to_string(),
        _ => String::new(),
    };
}

/// POSIX permissions are outside the honest host-provider surface until a real provider exists.
pub fn get_file_permissions(_path: &str) -> FileSystemProviderFuture<Option<FilePermissions>> {
    return resolved(None);
}

/// Real-path resolution is outside the honest host-provider surface until a real provider exists.
pub fn get_file_real_path(_path: &str) -> FileSystemProviderFuture<Option<String>> {
    return resolved(None);
}

/// Well-known native paths are outside the honest host-provider surface until a real provider exists.
pub fn get_file_system_path(_kind: FileSystemPathKind) -> String {
    return String::new();
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS FileSystemPathKind string union; the TS package exports no get_/parse_ free functions
pub fn get_file_system_path_kind_string(value: FileSystemPathKind) -> &'static str {
    return match value {
        FileSystemPathKind::AppData => "appData",
        FileSystemPathKind::Cache => "cache",
        FileSystemPathKind::Desktop => "desktop",
        FileSystemPathKind::Documents => "documents",
        FileSystemPathKind::Downloads => "downloads",
        FileSystemPathKind::Home => "home",
        FileSystemPathKind::Temp => "temp",
    };
}

pub fn get_file_system_usage(
    host_file_system: &HostFileSystemCapability,
) -> FileSystemProviderFuture<Option<FileSystemUsage>> {
    return match &host_file_system.get_file_system_usage {
        Some(usage) => usage(),
        None => resolved(None),
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS FileWatchEventType string union; the TS package exports no get_/parse_ free functions
pub fn get_file_watch_event_type_string(value: FileWatchEventType) -> &'static str {
    return match value {
        FileWatchEventType::Created => "created",
        FileWatchEventType::Deleted => "deleted",
        FileWatchEventType::Modified => "modified",
    };
}

// An anchored match of the compiled glob over the subject's UTF-16 code units (JS RegExp semantics:
// `.` excludes the line terminators \n, \r, U+2028 and U+2029; a negated class does not).
fn glob_matches(tokens: &[GlobToken], subject: &str) -> bool {
    let units: Vec<u16> = subject.encode_utf16().collect();
    // reachable[j]: the tokens consumed so far can end at code unit j.
    let mut reachable = vec![false; units.len() + 1];
    reachable[0] = true;
    for token in tokens {
        let mut next = vec![false; units.len() + 1];
        for start in 0..=units.len() {
            if !reachable[start] {
                continue;
            }
            match token {
                GlobToken::Literal(unit) => {
                    if units.get(start) == Some(unit) {
                        next[start + 1] = true;
                    }
                }
                GlobToken::AnySegmentUnit => {
                    if units
                        .get(start)
                        .is_some_and(|unit| *unit != u16::from(b'/'))
                    {
                        next[start + 1] = true;
                    }
                }
                GlobToken::AnySegmentRun | GlobToken::AnyRun => {
                    next[start] = true;
                    let mut end = start;
                    while end < units.len() && glob_run_accepts(*token, units[end]) {
                        end += 1;
                        next[end] = true;
                    }
                }
            }
        }
        reachable = next;
    }
    return reachable[units.len()];
}

fn glob_run_accepts(token: GlobToken, unit: u16) -> bool {
    return match token {
        GlobToken::AnyRun => !matches!(unit, 0x000a | 0x000d | 0x2028 | 0x2029),
        _ => unit != u16::from(b'/'),
    };
}

/// A POSIX root (`/`) or a drive spelling (`C:`).
pub fn is_absolute_file_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    if bytes.is_empty() {
        return false;
    }
    if bytes[0] == b'/' {
        return true;
    }
    return bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':';
}

/// Joins segments and resolves the result exactly as `normalize_file_path` resolves the same segments
/// spelled as one string, so a path has one spelling whichever entry point built it.
pub fn join_file_path(segments: &[&str]) -> String {
    let absolute = segments.first().is_some_and(|first| first.starts_with('/'));
    return format_resolved_path(
        &resolve_path_segments(&segments.join("/"), absolute),
        absolute,
    );
}

pub fn make_directory(
    host_file_system: &HostFileSystemCapability,
    path: &str,
) -> FileSystemProviderFuture<bool> {
    return match &host_file_system.make_directory {
        Some(make) => make(path),
        None => resolved(false),
    };
}

/// Collapses empty and `.` segments and resolves each `..` against the segment before it. An absolute
/// path clamps at the root (`/a/../../b` is `/b`); a relative path KEEPS a leading `..` (`a/../../b` is
/// `../b`), and one that cancels out is `.`.
pub fn normalize_file_path(path: &str) -> String {
    let absolute = path.starts_with('/');
    return format_resolved_path(&resolve_path_segments(path, absolute), absolute);
}

pub fn open_file_read_stream(
    host_file_system: &HostFileSystemCapability,
    path: &str,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<Option<ReadableStream>> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let Some(open) = &host_file_system.open_file_read_stream else {
        return Box::pin(ready(Ok(None)));
    };
    return open(path, signal);
}

pub fn open_file_write_stream(
    host_file_system: &HostFileSystemCapability,
    path: &str,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<Option<WritableStream>> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let Some(open) = &host_file_system.open_file_write_stream else {
        return Box::pin(ready(Ok(None)));
    };
    return open(path, signal);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS canAccessFile mode string union; the TS package exports no get_/parse_ free functions
pub fn parse_file_access_mode(value: &str) -> Option<FileAccessMode> {
    return match value {
        "executable" => Some(FileAccessMode::Executable),
        "readable" => Some(FileAccessMode::Readable),
        "writable" => Some(FileAccessMode::Writable),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS FileSystemPathKind string union; the TS package exports no get_/parse_ free functions
pub fn parse_file_system_path_kind(value: &str) -> Option<FileSystemPathKind> {
    return match value {
        "appData" => Some(FileSystemPathKind::AppData),
        "cache" => Some(FileSystemPathKind::Cache),
        "desktop" => Some(FileSystemPathKind::Desktop),
        "documents" => Some(FileSystemPathKind::Documents),
        "downloads" => Some(FileSystemPathKind::Downloads),
        "home" => Some(FileSystemPathKind::Home),
        "temp" => Some(FileSystemPathKind::Temp),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS FileWatchEventType string union; the TS package exports no get_/parse_ free functions
pub fn parse_file_watch_event_type(value: &str) -> Option<FileWatchEventType> {
    return match value {
        "created" => Some(FileWatchEventType::Created),
        "deleted" => Some(FileWatchEventType::Deleted),
        "modified" => Some(FileWatchEventType::Modified),
        _ => None,
    };
}

pub fn read_binary_file(
    host_file_system: &HostFileSystemCapability,
    path: &str,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<Option<Box<Uint8Array>>> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let Some(read) = &host_file_system.read_binary_file else {
        return resolved(None);
    };
    return read(path, signal);
}

pub fn read_binary_file_range(
    host_file_system: &HostFileSystemCapability,
    path: &str,
    offset: usize,
    length: usize,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<Option<Box<Uint8Array>>> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let Some(read) = &host_file_system.read_binary_file_range else {
        return resolved(None);
    };
    return read(path, offset, length, signal);
}

/// Reads a dialog handle's bytes: through the host for a handle with a native path, otherwise through
/// the handle's retained read operation (`None` when it has none).
pub fn read_dialog_handle_binary_file(
    host_file_system: &HostFileSystemCapability,
    handle: &Ref<FileDialogHandle>,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<Option<Box<Uint8Array>>> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let path = handle.read().unwrap().path.clone();
    if let Some(path) = path {
        return read_binary_file(host_file_system, &path, signal);
    }
    let Some(read) =
        get_file_dialog_handle_operations(handle).and_then(|operations| operations.read_binary)
    else {
        return resolved(None);
    };
    return read(signal);
}

/// Reads a dialog handle's text: through the host for a handle with a native path, otherwise through
/// the handle's retained read operation (`None` when it has none).
pub fn read_dialog_handle_text_file(
    host_file_system: &HostFileSystemCapability,
    handle: &Ref<FileDialogHandle>,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<Option<String>> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let path = handle.read().unwrap().path.clone();
    if let Some(path) = path {
        return read_text_file(host_file_system, &path, signal);
    }
    let Some(read) =
        get_file_dialog_handle_operations(handle).and_then(|operations| operations.read_text)
    else {
        return resolved(None);
    };
    return read(signal);
}

pub fn read_directory(
    host_file_system: &HostFileSystemCapability,
    path: &str,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<Vec<FileEntry>> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let Some(read) = &host_file_system.read_directory else {
        return resolved(Vec::new());
    };
    return read(path, signal);
}

/// The host's recursive walk; the options (and their signal) reach the host unchanged.
pub fn read_directory_recursive(
    host_file_system: &HostFileSystemCapability,
    path: &str,
    options: Option<&FileWalkOptions>,
) -> FileSystemProviderFuture<Vec<FileEntry>> {
    if let Some(rejected) = reject_if_aborted(options.and_then(|options| options.signal.as_ref())) {
        return rejected;
    }
    let Some(read) = &host_file_system.read_directory_recursive else {
        return resolved(Vec::new());
    };
    return read(path, options);
}

/// Symlinks are outside the honest host-provider surface until a real provider exists.
pub fn read_file_symlink(_path: &str) -> FileSystemProviderFuture<Option<String>> {
    return resolved(None);
}

pub fn read_text_file(
    host_file_system: &HostFileSystemCapability,
    path: &str,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<Option<String>> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let Some(read) = &host_file_system.read_text_file else {
        return resolved(None);
    };
    return read(path, signal);
}

// The source's `if (signal?.aborted) return Promise.reject(signal.reason)`: checked at call time, so
// the provider is never invoked; the returned future rejects with the reason itself.
fn reject_if_aborted<T: Send + 'static>(
    signal: Option<&AbortSignal>,
) -> Option<FileSystemProviderFuture<T>> {
    let signal = signal?;
    if !is_abort_signal_aborted(signal) {
        return None;
    }
    let reason = get_abort_signal_reason(signal).flatten();
    return Some(Box::pin(async move { std::panic::panic_any(reason) }));
}

pub fn remove_directory(
    host_file_system: &HostFileSystemCapability,
    path: &str,
    recursive: Option<bool>,
) -> FileSystemProviderFuture<bool> {
    return match &host_file_system.remove_directory {
        Some(remove) => remove(path, recursive),
        None => resolved(false),
    };
}

pub fn remove_file(
    host_file_system: &HostFileSystemCapability,
    path: &str,
) -> FileSystemProviderFuture<bool> {
    return match &host_file_system.remove_file {
        Some(remove) => remove(path),
        None => resolved(false),
    };
}

pub fn rename_file(
    host_file_system: &HostFileSystemCapability,
    from: &str,
    to: &str,
) -> FileSystemProviderFuture<bool> {
    return match &host_file_system.rename {
        Some(rename) => rename(from, to),
        None => resolved(false),
    };
}

fn resolve_path_segments(path: &str, absolute: bool) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for segment in split_path(path) {
        if segment != ".." {
            out.push(segment.to_string());
            continue;
        }
        if out.last().is_some_and(|previous| previous != "..") {
            out.pop();
            continue;
        }
        if !absolute {
            out.push("..".to_string());
        }
    }
    return out;
}

fn resolved<T: Send + 'static>(value: T) -> FileSystemProviderFuture<T> {
    return Box::pin(ready(Ok(value)));
}

/// POSIX permissions are outside the honest host-provider surface until a real provider exists.
pub fn set_file_permissions(
    _path: &str,
    _permissions: &FilePermissions,
) -> FileSystemProviderFuture<bool> {
    return resolved(false);
}

fn split_path(path: &str) -> Vec<&str> {
    return path
        .split('/')
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .collect();
}

pub fn stat_file(
    host_file_system: &HostFileSystemCapability,
    path: &str,
) -> FileSystemProviderFuture<Option<FileStat>> {
    return match &host_file_system.stat_file {
        Some(stat) => stat(path),
        None => resolved(None),
    };
}

/// File watching is outside the honest host-provider surface until a real provider exists: the
/// listener is never called and the unsubscribe is inert.
pub fn watch_path(_path: &str, _listener: FileWatchListener) -> FileWatchUnsubscribe {
    return Arc::new(|| {});
}

pub fn write_binary_file(
    host_file_system: &HostFileSystemCapability,
    path: &str,
    data: &Uint8Array,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<bool> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let Some(write) = &host_file_system.write_binary_file else {
        return resolved(false);
    };
    return write(path, data, signal);
}

/// Writes a dialog handle's bytes: through the host for a handle with a native path, otherwise through
/// the handle's retained write operation (`false` when it has none).
pub fn write_dialog_handle_binary_file(
    host_file_system: &HostFileSystemCapability,
    handle: &Ref<FileDialogHandle>,
    data: &Uint8Array,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<bool> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let path = handle.read().unwrap().path.clone();
    if let Some(path) = path {
        return write_binary_file(host_file_system, &path, data, signal);
    }
    let Some(write) =
        get_file_dialog_handle_operations(handle).and_then(|operations| operations.write_binary)
    else {
        return resolved(false);
    };
    return write(data, signal);
}

/// Writes a dialog handle's text: through the host for a handle with a native path, otherwise through
/// the handle's retained write operation (`false` when it has none).
pub fn write_dialog_handle_text_file(
    host_file_system: &HostFileSystemCapability,
    handle: &Ref<FileDialogHandle>,
    data: &str,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<bool> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let path = handle.read().unwrap().path.clone();
    if let Some(path) = path {
        return write_text_file(host_file_system, &path, data, signal);
    }
    let Some(write) =
        get_file_dialog_handle_operations(handle).and_then(|operations| operations.write_text)
    else {
        return resolved(false);
    };
    return write(data, signal);
}

pub fn write_file_atomic(
    host_file_system: &HostFileSystemCapability,
    path: &str,
    data: FileAtomicWriteData<'_>,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<bool> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let Some(write) = &host_file_system.write_file_atomic else {
        return resolved(false);
    };
    return write(path, data, signal);
}

pub fn write_text_file(
    host_file_system: &HostFileSystemCapability,
    path: &str,
    data: &str,
    signal: Option<&AbortSignal>,
) -> FileSystemProviderFuture<bool> {
    if let Some(rejected) = reject_if_aborted(signal) {
        return rejected;
    }
    let Some(write) = &host_file_system.write_text_file else {
        return resolved(false);
    };
    return write(path, data, signal);
}

impl HostFileSystemCapability {
    pub fn append_text_file(
        &self,
        path: &str,
        data: &str,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<bool> {
        return append_text_file(self, path, data, signal);
    }

    pub fn can_access_file(
        &self,
        path: &str,
        mode: FileAccessMode,
    ) -> FileSystemProviderFuture<bool> {
        return can_access_file(self, path, mode);
    }

    pub fn copy_file(&self, from: &str, to: &str) -> FileSystemProviderFuture<bool> {
        return copy_file(self, from, to);
    }

    pub fn directory_exists(&self, path: &str) -> FileSystemProviderFuture<bool> {
        return directory_exists(self, path);
    }

    pub fn file_exists(&self, path: &str) -> FileSystemProviderFuture<bool> {
        return file_exists(self, path);
    }

    pub fn find_files(
        &self,
        root_path: &str,
        pattern: &str,
        options: Option<&FileWalkOptions>,
    ) -> FileSystemProviderFuture<Vec<FileEntry>> {
        return find_files(self, root_path, pattern, options);
    }

    pub fn get_file_system_usage(&self) -> FileSystemProviderFuture<Option<FileSystemUsage>> {
        return get_file_system_usage(self);
    }

    pub fn make_directory(&self, path: &str) -> FileSystemProviderFuture<bool> {
        return make_directory(self, path);
    }

    pub fn open_file_read_stream(
        &self,
        path: &str,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<Option<ReadableStream>> {
        return open_file_read_stream(self, path, signal);
    }

    pub fn open_file_write_stream(
        &self,
        path: &str,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<Option<WritableStream>> {
        return open_file_write_stream(self, path, signal);
    }

    pub fn read_binary_file(
        &self,
        path: &str,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<Option<Box<Uint8Array>>> {
        return read_binary_file(self, path, signal);
    }

    pub fn read_binary_file_range(
        &self,
        path: &str,
        offset: usize,
        length: usize,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<Option<Box<Uint8Array>>> {
        return read_binary_file_range(self, path, offset, length, signal);
    }

    pub fn read_dialog_handle_binary_file(
        &self,
        handle: &Ref<FileDialogHandle>,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<Option<Box<Uint8Array>>> {
        return read_dialog_handle_binary_file(self, handle, signal);
    }

    pub fn read_dialog_handle_text_file(
        &self,
        handle: &Ref<FileDialogHandle>,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<Option<String>> {
        return read_dialog_handle_text_file(self, handle, signal);
    }

    pub fn read_directory(
        &self,
        path: &str,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<Vec<FileEntry>> {
        return read_directory(self, path, signal);
    }

    pub fn read_directory_recursive(
        &self,
        path: &str,
        options: Option<&FileWalkOptions>,
    ) -> FileSystemProviderFuture<Vec<FileEntry>> {
        return read_directory_recursive(self, path, options);
    }

    pub fn read_text_file(
        &self,
        path: &str,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<Option<String>> {
        return read_text_file(self, path, signal);
    }

    pub fn remove_directory(
        &self,
        path: &str,
        recursive: Option<bool>,
    ) -> FileSystemProviderFuture<bool> {
        return remove_directory(self, path, recursive);
    }

    pub fn remove_file(&self, path: &str) -> FileSystemProviderFuture<bool> {
        return remove_file(self, path);
    }

    pub fn rename_file(&self, from: &str, to: &str) -> FileSystemProviderFuture<bool> {
        return rename_file(self, from, to);
    }

    pub fn stat_file(&self, path: &str) -> FileSystemProviderFuture<Option<FileStat>> {
        return stat_file(self, path);
    }

    pub fn write_binary_file(
        &self,
        path: &str,
        data: &Uint8Array,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<bool> {
        return write_binary_file(self, path, data, signal);
    }

    pub fn write_dialog_handle_binary_file(
        &self,
        handle: &Ref<FileDialogHandle>,
        data: &Uint8Array,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<bool> {
        return write_dialog_handle_binary_file(self, handle, data, signal);
    }

    pub fn write_dialog_handle_text_file(
        &self,
        handle: &Ref<FileDialogHandle>,
        data: &str,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<bool> {
        return write_dialog_handle_text_file(self, handle, data, signal);
    }

    pub fn write_file_atomic(
        &self,
        path: &str,
        data: FileAtomicWriteData<'_>,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<bool> {
        return write_file_atomic(self, path, data, signal);
    }

    pub fn write_text_file(
        &self,
        path: &str,
        data: &str,
        signal: Option<&AbortSignal>,
    ) -> FileSystemProviderFuture<bool> {
        return write_text_file(self, path, data, signal);
    }
}
