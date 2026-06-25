//! File system free functions backed by the [`FileSystemBackend`] seam.
//!
//! The backend trait and its shared data types ([`FileEntry`], [`FileStat`],
//! [`FileSystemPathKind`], [`FileWatchEvent`]) are defined in `flighthq-types`.

use std::path::PathBuf;
use std::sync::OnceLock;

use flighthq_types::{
    FileAccessMode, FileDialogHandle, FileEntry, FilePermissions, FileStat, FileSystemBackend,
    FileSystemPathKind, FileSystemUsage, FileWalkOptions, FileWatchEvent,
};

// ---------------------------------------------------------------------------
// Native backend
// ---------------------------------------------------------------------------

/// Default native backend backed by [`std::fs`].
pub struct NativeFileSystemBackend;

impl FileSystemBackend for NativeFileSystemBackend {
    fn read_text_file(&self, path: &str) -> Option<String> {
        std::fs::read_to_string(path).ok()
    }

    fn write_text_file(&self, path: &str, data: &str) -> bool {
        let p = std::path::Path::new(path);
        if let Some(parent) = p.parent()
            && std::fs::create_dir_all(parent).is_err()
        {
            return false;
        }
        std::fs::write(p, data).is_ok()
    }

    fn read_binary_file(&self, path: &str) -> Option<Vec<u8>> {
        std::fs::read(path).ok()
    }

    fn write_binary_file(&self, path: &str, data: &[u8]) -> bool {
        let p = std::path::Path::new(path);
        if let Some(parent) = p.parent()
            && std::fs::create_dir_all(parent).is_err()
        {
            return false;
        }
        std::fs::write(p, data).is_ok()
    }

    fn file_exists(&self, path: &str) -> bool {
        std::path::Path::new(path).exists()
    }

    fn remove_file(&self, path: &str) -> bool {
        let p = std::path::Path::new(path);
        if p.is_dir() {
            std::fs::remove_dir_all(p).is_ok()
        } else {
            std::fs::remove_file(p).is_ok()
        }
    }

    fn make_directory(&self, path: &str) -> bool {
        std::fs::create_dir_all(path).is_ok()
    }

    fn read_directory(&self, path: &str) -> Vec<FileEntry> {
        let Ok(entries) = std::fs::read_dir(path) else {
            return vec![];
        };
        let mut out = Vec::new();
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let entry_path = entry.path().to_string_lossy().into_owned();
            let is_directory = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            out.push(FileEntry {
                name,
                path: entry_path,
                is_directory,
            });
        }
        out
    }

    fn stat_file(&self, path: &str) -> Option<FileStat> {
        let meta = std::fs::metadata(path).ok()?;
        let modified_time = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let created_time = meta
            .created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        Some(FileStat {
            size: meta.len(),
            is_directory: meta.is_dir(),
            modified_time,
            created_time,
            is_symlink: meta.file_type().is_symlink(),
        })
    }

    fn rename(&self, from: &str, to: &str) -> bool {
        std::fs::rename(from, to).is_ok()
    }

    fn copy(&self, from: &str, to: &str) -> bool {
        std::fs::copy(from, to).is_ok()
    }

    fn append_text_file(&self, path: &str, data: &str) -> bool {
        use std::io::Write as _;
        let p = std::path::Path::new(path);
        if let Some(parent) = p.parent()
            && std::fs::create_dir_all(parent).is_err()
        {
            return false;
        }
        let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(p)
        else {
            return false;
        };
        file.write_all(data.as_bytes()).is_ok()
    }

    fn read_binary_file_range(&self, path: &str, offset: u64, length: u64) -> Option<Vec<u8>> {
        use std::io::{Read as _, Seek as _, SeekFrom};
        let mut file = std::fs::File::open(path).ok()?;
        let len = file.metadata().ok()?.len();
        if offset >= len {
            return Some(Vec::new());
        }
        if file.seek(SeekFrom::Start(offset)).is_err() {
            return None;
        }
        let take = length.min(len - offset);
        let mut buf = vec![0u8; take as usize];
        file.read_exact(&mut buf).ok()?;
        Some(buf)
    }

    fn directory_exists(&self, path: &str) -> bool {
        std::path::Path::new(path).is_dir()
    }

    fn remove_directory(&self, path: &str, recursive: bool) -> bool {
        let p = std::path::Path::new(path);
        if !p.is_dir() {
            return false;
        }
        if recursive {
            std::fs::remove_dir_all(p).is_ok()
        } else {
            std::fs::remove_dir(p).is_ok()
        }
    }

    fn read_directory_recursive(&self, path: &str, options: &FileWalkOptions) -> Vec<FileEntry> {
        let mut out = Vec::new();
        let max_depth = options.max_depth;
        walk_native_directory(std::path::Path::new(path), &mut out, 0, max_depth);
        out
    }

    fn create_file_symlink(&self, target: &str, link_path: &str) -> bool {
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(target, link_path).is_ok()
        }
        #[cfg(not(unix))]
        {
            let _ = (target, link_path);
            false
        }
    }

    fn read_file_symlink(&self, path: &str) -> Option<String> {
        std::fs::read_link(path)
            .ok()
            .map(|p| p.to_string_lossy().into_owned())
    }

    fn get_file_real_path(&self, path: &str) -> Option<String> {
        std::fs::canonicalize(path)
            .ok()
            .map(|p| p.to_string_lossy().into_owned())
    }

    fn get_file_permissions(&self, path: &str) -> Option<FilePermissions> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            let mode = std::fs::metadata(path).ok()?.permissions().mode();
            Some(permissions_from_mode(mode))
        }
        #[cfg(not(unix))]
        {
            let _ = path;
            None
        }
    }

    fn set_file_permissions(&self, path: &str, permissions: &FilePermissions) -> bool {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            let perms = std::fs::Permissions::from_mode(mode_from_permissions(permissions));
            std::fs::set_permissions(path, perms).is_ok()
        }
        #[cfg(not(unix))]
        {
            let _ = (path, permissions);
            false
        }
    }

    fn can_access_file(&self, path: &str, mode: FileAccessMode) -> bool {
        let Ok(meta) = std::fs::metadata(path) else {
            return false;
        };
        match mode {
            FileAccessMode::Readable => true,
            FileAccessMode::Writable => !meta.permissions().readonly(),
            FileAccessMode::Executable => {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt as _;
                    meta.permissions().mode() & 0o111 != 0
                }
                #[cfg(not(unix))]
                {
                    false
                }
            }
        }
    }

    fn get_file_system_usage(&self) -> Option<FileSystemUsage> {
        // statvfs is not available through std; a native host backend can override with a real
        // statvfs implementation. The default native backend reports usage as unavailable.
        None
    }

    fn write_file_atomic(&self, path: &str, data: &[u8]) -> bool {
        // Write to a temp sibling, then rename over the destination (atomic on POSIX same-fs).
        let tmp_path = format!("{path}.__atomic_tmp__");
        let dest = std::path::Path::new(path);
        if let Some(parent) = dest.parent()
            && std::fs::create_dir_all(parent).is_err()
        {
            return false;
        }
        if std::fs::write(&tmp_path, data).is_err() {
            return false;
        }
        if std::fs::rename(&tmp_path, path).is_ok() {
            true
        } else {
            let _ = std::fs::remove_file(&tmp_path);
            false
        }
    }

    fn watch(
        &self,
        _path: &str,
        _listener: Box<dyn Fn(&FileWatchEvent) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        // Native file watching requires an OS watcher (e.g., inotify/kqueue/ReadDirectoryChanges).
        // Stub: returns a no-op unsubscribe. A full implementation would register an OS watcher here.
        Box::new(|| {})
    }

    fn get_path(&self, kind: FileSystemPathKind) -> String {
        native_standard_path(kind)
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default()
    }
}

// ---------------------------------------------------------------------------
// Global backend slot
// ---------------------------------------------------------------------------

static BACKEND: OnceLock<Box<dyn FileSystemBackend>> = OnceLock::new();

fn get_backend() -> &'static dyn FileSystemBackend {
    BACKEND
        .get_or_init(|| Box::new(NativeFileSystemBackend))
        .as_ref()
}

// ---------------------------------------------------------------------------
// Public free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Appends text to a file, creating it when missing. Returns `false` when denied.
pub fn append_text_file(path: &str, data: &str) -> bool {
    get_backend().append_text_file(path, data)
}

/// `true` when the file/directory at `path` can be accessed in the given mode. Web returns `false`
/// for `Executable`; `Readable`/`Writable` are best-effort.
pub fn can_access_file(path: &str, mode: FileAccessMode) -> bool {
    get_backend().can_access_file(path, mode)
}

/// Copies a file from `from` to `to`. Returns `false` when the source is missing or denied.
pub fn copy_file(from: &str, to: &str) -> bool {
    get_backend().copy(from, to)
}

/// Creates a symbolic link at `link_path` pointing to `target`. Returns `false` when unsupported
/// (web/OPFS always returns `false`; native-only capability).
pub fn create_file_symlink(target: &str, link_path: &str) -> bool {
    get_backend().create_file_symlink(target, link_path)
}

/// `true` when a directory exists at `path`. Returns `false` when missing or access is denied.
pub fn directory_exists(path: &str) -> bool {
    get_backend().directory_exists(path)
}

/// Returns `true` when a file or directory exists at `path`.
pub fn file_exists(path: &str) -> bool {
    get_backend().file_exists(path)
}

/// Returns all entries under `root_path` whose name or path matches the given glob `pattern`.
/// Supports `*` (any chars within a segment), `**` (any depth), and `?` (single char). Composes
/// with `read_directory_recursive`; `[]` sentinel for missing or access denied.
pub fn find_files(root_path: &str, pattern: &str) -> Vec<FileEntry> {
    let all = get_backend().read_directory_recursive(root_path, &FileWalkOptions::default());
    if all.is_empty() {
        return Vec::new();
    }
    let matcher = GlobMatcher::new(pattern);
    all.into_iter()
        .filter(|entry| matcher.is_match(&entry.name) || matcher.is_match(&entry.path))
        .collect()
}

/// Returns the base name of a path (the final segment, with extension). e.g. `foo/bar.txt` →
/// `bar.txt`.
pub fn get_file_base_name(path: &str) -> String {
    split_web_path(path)
        .into_iter()
        .next_back()
        .unwrap_or_default()
}

/// Returns the directory portion of a path (all segments before the last). e.g. `foo/bar.txt` →
/// `foo`.
pub fn get_file_directory_name(path: &str) -> String {
    let segments = split_web_path(path);
    if segments.len() <= 1 {
        return String::new();
    }
    segments[..segments.len() - 1].join("/")
}

/// Returns the file extension including the leading dot, or `""` if none. e.g. `foo/bar.txt` →
/// `.txt`.
pub fn get_file_extension_name(path: &str) -> String {
    let base = get_file_base_name(path);
    match base.rfind('.') {
        Some(dot) if dot > 0 => base[dot..].to_string(),
        _ => String::new(),
    }
}

/// Returns permission attributes for `path`, or `None` when unavailable (web/OPFS always `None`).
pub fn get_file_permissions(path: &str) -> Option<FilePermissions> {
    get_backend().get_file_permissions(path)
}

/// Resolves a path to its canonical (symlink-free) absolute path, or `None` when the path is
/// missing, denied, or symlinks are unsupported (web always returns `None`).
pub fn get_file_real_path(path: &str) -> Option<String> {
    get_backend().get_file_real_path(path)
}

/// Returns the active file system backend.
pub fn get_file_system_backend() -> &'static dyn FileSystemBackend {
    get_backend()
}

/// Resolves a well-known host directory to an absolute path, or `""` when unavailable.
pub fn get_file_system_path(kind: FileSystemPathKind) -> String {
    get_backend().get_path(kind)
}

/// Returns disk or quota usage for the active file system, or `None` when unavailable.
pub fn get_file_system_usage() -> Option<FileSystemUsage> {
    get_backend().get_file_system_usage()
}

/// `true` when `path` is absolute (starts with `/` or a Windows drive letter, e.g. `C:`).
pub fn is_absolute_file_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    if bytes.is_empty() {
        return false;
    }
    if bytes[0] == b'/' {
        return true;
    }
    // Windows drive letter: e.g. 'C:\' or 'C:/'
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

/// Joins path segments with `/`, normalizing redundant separators and `.` segments.
/// e.g. `join_file_path(&["foo", "bar", "baz.txt"])` → `foo/bar/baz.txt`.
pub fn join_file_path(segments: &[&str]) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for segment in segments {
        for part in segment.split('/') {
            if part.is_empty() || part == "." {
                continue;
            }
            parts.push(part);
        }
    }
    let prefix = if segments.first().is_some_and(|s| s.starts_with('/')) {
        "/"
    } else {
        ""
    };
    format!("{prefix}{}", parts.join("/"))
}

/// Creates a directory (and parents) at `path`. Returns `false` when denied.
pub fn make_directory(path: &str) -> bool {
    get_backend().make_directory(path)
}

/// Normalizes a path: collapses redundant separators, removes `.` segments, preserves leading `/`.
/// e.g. `normalize_file_path("foo//./bar")` → `foo/bar`.
pub fn normalize_file_path(path: &str) -> String {
    let parts = split_web_path(path);
    let prefix = if path.starts_with('/') { "/" } else { "" };
    format!("{prefix}{}", parts.join("/"))
}

/// Reads a file as raw bytes, or `None` when missing or access is denied.
pub fn read_binary_file(path: &str) -> Option<Vec<u8>> {
    get_backend().read_binary_file(path)
}

/// Reads a byte slice of a file at `offset` with `length` bytes. Returns an empty `Vec` for
/// out-of-range access, `None` for missing or access denied.
pub fn read_binary_file_range(path: &str, offset: u64, length: u64) -> Option<Vec<u8>> {
    get_backend().read_binary_file_range(path, offset, length)
}

/// Reads bytes from a [`FileDialogHandle`]. On native hosts `handle.path` is a real path and is
/// read directly; otherwise falls back to the backend by `handle.name`. Returns `None` when the
/// handle is unreadable or the path/name is unavailable.
pub fn read_dialog_handle_binary_file(handle: &FileDialogHandle) -> Option<Vec<u8>> {
    if let Some(path) = handle.path.as_deref() {
        return get_backend().read_binary_file(path);
    }
    // The live web FileSystem handle (getWebFileSystemHandle) is web-only and absent on native;
    // fall back to OPFS/backend by file name.
    if handle.name.is_empty() {
        return None;
    }
    get_backend().read_binary_file(&handle.name)
}

/// Reads text from a [`FileDialogHandle`]. On native hosts `handle.path` is a real path and is read
/// directly; otherwise falls back to the backend by `handle.name`. Returns `None` when the handle
/// is unreadable or the path/name is unavailable.
pub fn read_dialog_handle_text_file(handle: &FileDialogHandle) -> Option<String> {
    if let Some(path) = handle.path.as_deref() {
        return get_backend().read_text_file(path);
    }
    if handle.name.is_empty() {
        return None;
    }
    get_backend().read_text_file(&handle.name)
}

/// Lists directory entries (one level only). Returns `[]` when missing or access is denied.
pub fn read_directory(path: &str) -> Vec<FileEntry> {
    get_backend().read_directory(path)
}

/// Depth-first walk returning all descendants with full relative paths. `[]` for missing or denied.
pub fn read_directory_recursive(path: &str, options: &FileWalkOptions) -> Vec<FileEntry> {
    get_backend().read_directory_recursive(path, options)
}

/// Reads the target of a symbolic link at `path`. Returns `None` when not a symlink, missing, or
/// symlinks are unsupported (web/OPFS always returns `None`).
pub fn read_file_symlink(path: &str) -> Option<String> {
    get_backend().read_file_symlink(path)
}

/// Reads a file as a UTF-8 string, or `None` when missing or access is denied.
pub fn read_text_file(path: &str) -> Option<String> {
    get_backend().read_text_file(path)
}

/// Removes a directory at `path`. When `recursive` is `false`, fails on non-empty directories.
/// Returns `false` when missing or access is denied.
pub fn remove_directory(path: &str, recursive: bool) -> bool {
    get_backend().remove_directory(path, recursive)
}

/// Removes a file at `path`. Returns `false` when missing or denied. To remove a directory, use
/// [`remove_directory`].
pub fn remove_file(path: &str) -> bool {
    get_backend().remove_file(path)
}

/// Renames or moves from `from` to `to`. Returns `false` when source is missing or denied.
pub fn rename_file(from: &str, to: &str) -> bool {
    get_backend().rename(from, to)
}

/// Sets file permissions for `path`. Returns `false` when unsupported (web/OPFS always `false`;
/// native POSIX backends use chmod).
pub fn set_file_permissions(path: &str, permissions: &FilePermissions) -> bool {
    get_backend().set_file_permissions(path, permissions)
}

/// Installs a native host file system backend.
///
/// # Panics
///
/// Panics if called after the backend has already been initialized (first use or a prior
/// `set_file_system_backend` call).
pub fn set_file_system_backend(backend: Box<dyn FileSystemBackend>) {
    if BACKEND.set(backend).is_err() {
        panic!("file system backend already initialized");
    }
}

/// Reads metadata for `path`, or `None` when missing or access is denied.
pub fn stat_file(path: &str) -> Option<FileStat> {
    get_backend().stat_file(path)
}

/// Watches `path` for changes. Returns an unsubscribe closure.
pub fn watch_path(
    path: &str,
    listener: Box<dyn Fn(&FileWatchEvent) + Send + Sync>,
) -> Box<dyn Fn() + Send + Sync> {
    get_backend().watch(path, listener)
}

/// Writes bytes to a file, creating parent directories. Returns `false` when denied.
pub fn write_binary_file(path: &str, data: &[u8]) -> bool {
    get_backend().write_binary_file(path, data)
}

/// Writes bytes to a [`FileDialogHandle`] (typically a save-file handle). On native hosts
/// `handle.path` is a real path and is written directly. Returns `false` when the handle is not
/// writable or the path is unavailable.
pub fn write_dialog_handle_binary_file(handle: &FileDialogHandle, data: &[u8]) -> bool {
    match handle.path.as_deref() {
        Some(path) => get_backend().write_binary_file(path, data),
        // The live web writable handle is web-only; on native a handle with no path is not writable.
        None => false,
    }
}

/// Writes text to a [`FileDialogHandle`] (typically a save-file handle). On native hosts
/// `handle.path` is a real path and is written directly. Returns `false` when the handle is not
/// writable or the path is unavailable.
pub fn write_dialog_handle_text_file(handle: &FileDialogHandle, data: &str) -> bool {
    match handle.path.as_deref() {
        Some(path) => get_backend().write_text_file(path, data),
        None => false,
    }
}

/// Atomic write: writes data to a temp sibling and moves it into place. On web (OPFS) the rename is
/// copy+remove (not OS-atomic) — best-effort. Returns `false` when the write or rename fails.
pub fn write_file_atomic(path: &str, data: &[u8]) -> bool {
    get_backend().write_file_atomic(path, data)
}

/// Writes text to a file, creating parent directories. Returns `false` when denied.
pub fn write_text_file(path: &str, data: &str) -> bool {
    get_backend().write_text_file(path, data)
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

fn native_standard_path(kind: FileSystemPathKind) -> Option<PathBuf> {
    match kind {
        FileSystemPathKind::Home => dirs_next_home(),
        FileSystemPathKind::Documents => dirs_next_documents(),
        FileSystemPathKind::Desktop => dirs_next_desktop(),
        FileSystemPathKind::Downloads => dirs_next_downloads(),
        FileSystemPathKind::Temp => Some(std::env::temp_dir()),
        FileSystemPathKind::AppData => dirs_next_data_local(),
        FileSystemPathKind::Cache => dirs_next_cache(),
    }
}

// Inline minimal directory resolution using environment variables; avoids a `dirs` crate dep.
// A host-provided backend can override with the full `dirs`/`dirs-next` equivalent.

fn dirs_next_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn dirs_next_documents() -> Option<PathBuf> {
    dirs_next_home().map(|h| h.join("Documents"))
}

fn dirs_next_desktop() -> Option<PathBuf> {
    dirs_next_home().map(|h| h.join("Desktop"))
}

fn dirs_next_downloads() -> Option<PathBuf> {
    dirs_next_home().map(|h| h.join("Downloads"))
}

fn dirs_next_data_local() -> Option<PathBuf> {
    // XDG_DATA_HOME → $HOME/.local/share on Linux; a native host backend can refine per-OS.
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| dirs_next_home().map(|h| h.join(".local").join("share")))
}

fn dirs_next_cache() -> Option<PathBuf> {
    std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .or_else(|| dirs_next_home().map(|h| h.join(".cache")))
}

// Splits a '/'-separated path into segments, dropping empty and '.' segments. Mirrors the TS
// `splitWebPath` used by the path-utility functions.
fn split_web_path(path: &str) -> Vec<String> {
    path.split('/')
        .filter(|s| !s.is_empty() && *s != ".")
        .map(str::to_string)
        .collect()
}

// Recursively walks a directory, appending entries to `out`. `depth` is the current depth
// (0 = entries directly inside the walked root); `max_depth` of `None` is unbounded.
fn walk_native_directory(
    dir: &std::path::Path,
    out: &mut Vec<FileEntry>,
    depth: u32,
    max_depth: Option<u32>,
) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let entry_path = entry.path();
        let path_string = entry_path.to_string_lossy().into_owned();
        let is_directory = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        out.push(FileEntry {
            name,
            path: path_string,
            is_directory,
        });
        if is_directory && max_depth.is_none_or(|m| depth < m) {
            walk_native_directory(&entry_path, out, depth + 1, max_depth);
        }
    }
}

// Derives readable/writable/executable from POSIX owner mode bits. Unix-only.
#[cfg(unix)]
fn permissions_from_mode(mode: u32) -> FilePermissions {
    FilePermissions {
        readable: mode & 0o400 != 0,
        writable: mode & 0o200 != 0,
        executable: mode & 0o100 != 0,
    }
}

// Maps readable/writable/executable onto POSIX owner mode bits (rwx for owner). Unix-only.
#[cfg(unix)]
fn mode_from_permissions(p: &FilePermissions) -> u32 {
    let mut mode = 0u32;
    if p.readable {
        mode |= 0o400;
    }
    if p.writable {
        mode |= 0o200;
    }
    if p.executable {
        mode |= 0o100;
    }
    mode
}

// A compiled glob pattern supporting `*`, `**`, and `?`, matched case-sensitively against a whole
// string. Mirrors the TS `globToRegExp` semantics: `*` matches any chars except `/`, `**` matches
// any chars including `/` (and absorbs a following `/`), `?` matches one char. Implemented as a
// recursive backtracking matcher to avoid a regex dependency.
struct GlobMatcher {
    tokens: Vec<GlobToken>,
}

enum GlobToken {
    Literal(char),
    AnyWithinSegment,  // '*'
    AnyAcrossSegments, // '**'
    SingleChar,        // '?'
}

impl GlobMatcher {
    fn new(pattern: &str) -> Self {
        let chars: Vec<char> = pattern.chars().collect();
        let mut tokens = Vec::new();
        let mut i = 0;
        while i < chars.len() {
            let ch = chars[i];
            if ch == '*' {
                if chars.get(i + 1) == Some(&'*') {
                    tokens.push(GlobToken::AnyAcrossSegments);
                    i += 1;
                    // Skip an optional trailing '/' after '**'.
                    if chars.get(i + 1) == Some(&'/') {
                        i += 1;
                    }
                } else {
                    tokens.push(GlobToken::AnyWithinSegment);
                }
            } else if ch == '?' {
                tokens.push(GlobToken::SingleChar);
            } else {
                tokens.push(GlobToken::Literal(ch));
            }
            i += 1;
        }
        GlobMatcher { tokens }
    }

    fn is_match(&self, text: &str) -> bool {
        let chars: Vec<char> = text.chars().collect();
        glob_match_from(&self.tokens, 0, &chars, 0)
    }
}

// Backtracking matcher: `ti` is the token index, `ci` the char index.
fn glob_match_from(tokens: &[GlobToken], ti: usize, text: &[char], ci: usize) -> bool {
    if ti == tokens.len() {
        return ci == text.len();
    }
    match &tokens[ti] {
        GlobToken::Literal(expected) => {
            ci < text.len()
                && text[ci] == *expected
                && glob_match_from(tokens, ti + 1, text, ci + 1)
        }
        GlobToken::SingleChar => ci < text.len() && glob_match_from(tokens, ti + 1, text, ci + 1),
        GlobToken::AnyWithinSegment => {
            // Match zero-or-more non-'/' chars, then the rest.
            let mut k = ci;
            loop {
                if glob_match_from(tokens, ti + 1, text, k) {
                    return true;
                }
                if k >= text.len() || text[k] == '/' {
                    return false;
                }
                k += 1;
            }
        }
        GlobToken::AnyAcrossSegments => {
            // Match zero-or-more of any char, then the rest.
            let mut k = ci;
            loop {
                if glob_match_from(tokens, ti + 1, text, k) {
                    return true;
                }
                if k >= text.len() {
                    return false;
                }
                k += 1;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;

    // Builds a unique temp path under the OS temp dir; not created on disk.
    fn unique_temp_path(suffix: &str) -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let pid = std::process::id();
        std::env::temp_dir().join(format!("flighthq_fs_{pid}_{n}_{suffix}"))
    }

    // append_text_file
    #[test]
    fn append_text_file_creates_file() {
        let path = unique_temp_path("append.txt");
        let p = path.to_str().unwrap();
        let backend = NativeFileSystemBackend;
        assert!(backend.append_text_file(p, "a"));
        assert!(backend.append_text_file(p, "b"));
        assert_eq!(backend.read_text_file(p).as_deref(), Some("ab"));
        backend.remove_file(p);
    }

    // copy_file
    #[test]
    fn copy_file_copies_content() {
        let from = unique_temp_path("copy_src.txt");
        let to = unique_temp_path("copy_dst.txt");
        let backend = NativeFileSystemBackend;
        let fp = from.to_str().unwrap();
        let tp = to.to_str().unwrap();
        assert!(backend.write_text_file(fp, "payload"));
        assert!(backend.copy(fp, tp));
        assert_eq!(backend.read_text_file(tp).as_deref(), Some("payload"));
        backend.remove_file(fp);
        backend.remove_file(tp);
    }

    // can_access_file
    #[test]
    fn can_access_file_readable_and_missing() {
        let path = unique_temp_path("access.txt");
        let backend = NativeFileSystemBackend;
        let p = path.to_str().unwrap();
        // Missing file: no mode is accessible.
        assert!(!backend.can_access_file(p, FileAccessMode::Readable));
        assert!(backend.write_text_file(p, "x"));
        assert!(backend.can_access_file(p, FileAccessMode::Readable));
        // Executable mode is false for a plain text file written without exec bits.
        assert!(!backend.can_access_file(p, FileAccessMode::Executable));
        backend.remove_file(p);
    }

    // create_file_symlink
    #[cfg(unix)]
    #[test]
    fn create_file_symlink_links_to_target() {
        let target = unique_temp_path("symlink_target.txt");
        let link = unique_temp_path("symlink_link.txt");
        let backend = NativeFileSystemBackend;
        let tp = target.to_str().unwrap();
        let lp = link.to_str().unwrap();
        assert!(backend.write_text_file(tp, "via symlink"));
        assert!(backend.create_file_symlink(tp, lp));
        assert_eq!(backend.read_file_symlink(lp).as_deref(), Some(tp));
        assert_eq!(backend.read_text_file(lp).as_deref(), Some("via symlink"));
        backend.remove_file(lp);
        backend.remove_file(tp);
    }

    // directory_exists
    #[test]
    fn directory_exists_reflects_state() {
        let dir = unique_temp_path("dir_exists");
        let backend = NativeFileSystemBackend;
        let dp = dir.to_str().unwrap();
        assert!(!backend.directory_exists(dp));
        assert!(backend.make_directory(dp));
        assert!(backend.directory_exists(dp));
        // A file is not a directory.
        let file = dir.join("f.txt");
        assert!(backend.write_text_file(file.to_str().unwrap(), "x"));
        assert!(!backend.directory_exists(file.to_str().unwrap()));
        backend.remove_directory(dp, true);
    }

    // file_exists
    #[test]
    fn file_exists_missing() {
        let path = unique_temp_path("absent.txt");
        let backend = NativeFileSystemBackend;
        let p = path.to_str().unwrap();
        assert!(!backend.file_exists(p));
        assert!(backend.write_text_file(p, "x"));
        assert!(backend.file_exists(p));
        backend.remove_file(p);
    }

    // find_files
    #[test]
    fn find_files_matches_glob_by_name_and_path() {
        let root = unique_temp_path("find_root");
        let backend = NativeFileSystemBackend;
        let rp = root.to_str().unwrap();
        assert!(backend.make_directory(rp));
        assert!(backend.write_text_file(root.join("a.txt").to_str().unwrap(), "a"));
        let sub = root.join("sub");
        assert!(backend.make_directory(sub.to_str().unwrap()));
        assert!(backend.write_text_file(sub.join("b.txt").to_str().unwrap(), "b"));

        let all = backend.read_directory_recursive(rp, &FileWalkOptions::default());
        // Glob '*.txt' matches the file names regardless of directory.
        let star = GlobMatcher::new("*.txt");
        assert!(
            all.iter()
                .any(|e| star.is_match(&e.name) && e.name == "a.txt")
        );
        assert!(
            all.iter()
                .any(|e| star.is_match(&e.name) && e.name == "b.txt")
        );
        // Glob '**/*.txt' matches deep paths.
        let deep = GlobMatcher::new("**/b.txt");
        assert!(all.iter().any(|e| deep.is_match(&e.path)));
        backend.remove_directory(rp, true);
    }

    // get_file_base_name
    #[test]
    fn get_file_base_name_returns_final_segment() {
        assert_eq!(get_file_base_name("foo/bar.txt"), "bar.txt");
        assert_eq!(get_file_base_name("bar.txt"), "bar.txt");
        assert_eq!(get_file_base_name("/a/b/c.js"), "c.js");
        assert_eq!(get_file_base_name(""), "");
    }

    // get_file_directory_name
    #[test]
    fn get_file_directory_name_returns_prefix() {
        assert_eq!(get_file_directory_name("foo/bar.txt"), "foo");
        assert_eq!(get_file_directory_name("a/b/c.txt"), "a/b");
        assert_eq!(get_file_directory_name("bar.txt"), "");
        assert_eq!(get_file_directory_name(""), "");
    }

    // get_file_extension_name
    #[test]
    fn get_file_extension_name_returns_extension() {
        assert_eq!(get_file_extension_name("foo/bar.txt"), ".txt");
        assert_eq!(get_file_extension_name("archive.tar.gz"), ".gz");
        assert_eq!(get_file_extension_name("Makefile"), "");
        assert_eq!(get_file_extension_name(".hidden"), "");
        assert_eq!(get_file_extension_name(""), "");
    }

    // get_file_permissions
    #[cfg(unix)]
    #[test]
    fn get_file_permissions_round_trips_through_native_backend() {
        let path = unique_temp_path("perms.txt");
        let backend = NativeFileSystemBackend;
        let p = path.to_str().unwrap();
        assert!(backend.write_text_file(p, "x"));
        let perms = FilePermissions {
            readable: true,
            writable: true,
            executable: false,
        };
        assert!(backend.set_file_permissions(p, &perms));
        let got = backend
            .get_file_permissions(p)
            .expect("permissions present");
        assert!(got.readable);
        assert!(got.writable);
        assert!(!got.executable);
        backend.remove_file(p);
    }

    // get_file_real_path
    #[test]
    fn get_file_real_path_resolves_existing_file() {
        let path = unique_temp_path("realpath.txt");
        let backend = NativeFileSystemBackend;
        let p = path.to_str().unwrap();
        assert!(backend.get_file_real_path(p).is_none());
        assert!(backend.write_text_file(p, "x"));
        assert!(backend.get_file_real_path(p).is_some());
        backend.remove_file(p);
    }

    // get_file_system_path
    #[test]
    fn get_file_system_path_temp() {
        let backend = NativeFileSystemBackend;
        let temp = backend.get_path(FileSystemPathKind::Temp);
        assert_eq!(temp, std::env::temp_dir().to_string_lossy());
    }

    // get_file_system_usage
    #[test]
    fn get_file_system_usage_default_native_is_none() {
        let backend = NativeFileSystemBackend;
        assert!(backend.get_file_system_usage().is_none());
    }

    // is_absolute_file_path
    #[test]
    fn is_absolute_file_path_classifies_paths() {
        assert!(is_absolute_file_path("/foo/bar"));
        assert!(is_absolute_file_path("/"));
        assert!(is_absolute_file_path("C:/foo"));
        assert!(is_absolute_file_path("D:\\foo"));
        assert!(!is_absolute_file_path("foo/bar"));
        assert!(!is_absolute_file_path(""));
        assert!(!is_absolute_file_path("relative"));
    }

    // join_file_path
    #[test]
    fn join_file_path_joins_and_normalizes() {
        assert_eq!(
            join_file_path(&["foo", "bar", "baz.txt"]),
            "foo/bar/baz.txt"
        );
        assert_eq!(join_file_path(&["foo/", "/bar", "./baz"]), "foo/bar/baz");
        assert_eq!(join_file_path(&["a", ".", "b"]), "a/b");
        assert_eq!(join_file_path(&["/foo", "bar"]), "/foo/bar");
        assert_eq!(join_file_path(&[]), "");
    }

    // make_directory
    #[test]
    fn make_directory_creates_nested() {
        let root = unique_temp_path("mkdir_root");
        let nested = root.join("a").join("b");
        let backend = NativeFileSystemBackend;
        let np = nested.to_str().unwrap();
        assert!(backend.make_directory(np));
        assert!(backend.file_exists(np));
        backend.remove_file(root.to_str().unwrap());
    }

    // normalize_file_path
    #[test]
    fn normalize_file_path_collapses_and_preserves_root() {
        assert_eq!(normalize_file_path("foo//./bar"), "foo/bar");
        assert_eq!(normalize_file_path("./a/./b"), "a/b");
        assert_eq!(normalize_file_path("/foo//bar"), "/foo/bar");
        assert_eq!(normalize_file_path(""), "");
    }

    // read_binary_file
    #[test]
    fn read_binary_file_returns_none_when_missing() {
        assert!(read_binary_file("/no/such/file.bin").is_none());
    }

    // read_binary_file_range
    #[test]
    fn read_binary_file_range_slices_and_handles_bounds() {
        let path = unique_temp_path("range.bin");
        let backend = NativeFileSystemBackend;
        let p = path.to_str().unwrap();
        assert!(backend.write_binary_file(p, &[10, 20, 30, 40, 50]));
        assert_eq!(
            backend.read_binary_file_range(p, 1, 3).as_deref(),
            Some(&[20u8, 30, 40][..])
        );
        // Out-of-range offset returns an empty Vec, not None.
        let oob = backend.read_binary_file_range(p, 100, 4);
        assert_eq!(oob.as_deref(), Some(&[][..]));
        // Length past EOF is clamped.
        assert_eq!(
            backend.read_binary_file_range(p, 3, 100).as_deref(),
            Some(&[40u8, 50][..])
        );
        backend.remove_file(p);
        // Missing file returns None.
        assert!(backend.read_binary_file_range(p, 0, 4).is_none());
    }

    // read_dialog_handle_binary_file
    #[test]
    fn read_dialog_handle_binary_file_reads_by_path_and_null_path() {
        let path = unique_temp_path("dlg.bin");
        let backend = NativeFileSystemBackend;
        let p = path.to_str().unwrap();
        assert!(backend.write_binary_file(p, &[4, 5, 6]));
        let handle = FileDialogHandle {
            kind: flighthq_types::FileDialogHandleKind::File,
            name: "dlg.bin".to_string(),
            path: Some(p.to_string()),
        };
        // Path-based read delegates to the (default native) global backend.
        assert_eq!(
            read_dialog_handle_binary_file(&handle).as_deref(),
            Some(&[4u8, 5, 6][..])
        );
        backend.remove_file(p);
        // Null path with no live web handle and an empty name returns None.
        let null_handle = FileDialogHandle {
            kind: flighthq_types::FileDialogHandleKind::File,
            name: String::new(),
            path: None,
        };
        assert!(read_dialog_handle_binary_file(&null_handle).is_none());
    }

    // read_dialog_handle_text_file
    #[test]
    fn read_dialog_handle_text_file_reads_by_path_and_null_path() {
        let path = unique_temp_path("dlg.txt");
        let backend = NativeFileSystemBackend;
        let p = path.to_str().unwrap();
        assert!(backend.write_text_file(p, "hello world"));
        let handle = FileDialogHandle {
            kind: flighthq_types::FileDialogHandleKind::File,
            name: "dlg.txt".to_string(),
            path: Some(p.to_string()),
        };
        assert_eq!(
            read_dialog_handle_text_file(&handle).as_deref(),
            Some("hello world")
        );
        backend.remove_file(p);
        let null_handle = FileDialogHandle {
            kind: flighthq_types::FileDialogHandleKind::File,
            name: String::new(),
            path: None,
        };
        assert!(read_dialog_handle_text_file(&null_handle).is_none());
    }

    // read_directory
    #[test]
    fn read_directory_returns_empty_when_missing() {
        assert!(read_directory("/no/such/dir").is_empty());
    }

    // read_directory_recursive
    #[test]
    fn read_directory_recursive_walks_descendants_and_respects_depth() {
        let root = unique_temp_path("walk_root");
        let backend = NativeFileSystemBackend;
        let rp = root.to_str().unwrap();
        assert!(backend.make_directory(rp));
        assert!(backend.write_text_file(root.join("a.txt").to_str().unwrap(), "a"));
        let sub = root.join("sub");
        assert!(backend.make_directory(sub.to_str().unwrap()));
        assert!(backend.write_text_file(sub.join("b.txt").to_str().unwrap(), "b"));

        let all = backend.read_directory_recursive(rp, &FileWalkOptions::default());
        assert!(all.iter().any(|e| e.name == "a.txt"));
        assert!(all.iter().any(|e| e.name == "sub" && e.is_directory));
        assert!(all.iter().any(|e| e.name == "b.txt"));

        // max_depth 0: only immediate entries, no descent into 'sub'.
        let shallow = backend.read_directory_recursive(rp, &FileWalkOptions { max_depth: Some(0) });
        assert!(shallow.iter().any(|e| e.name == "sub"));
        assert!(!shallow.iter().any(|e| e.name == "b.txt"));

        // Missing directory yields [].
        assert!(
            backend
                .read_directory_recursive("/no/such/dir", &FileWalkOptions::default())
                .is_empty()
        );
        backend.remove_directory(rp, true);
    }

    // read_file_symlink
    #[test]
    fn read_file_symlink_returns_none_for_non_symlink() {
        let path = unique_temp_path("plain.txt");
        let backend = NativeFileSystemBackend;
        let p = path.to_str().unwrap();
        assert!(backend.write_text_file(p, "x"));
        assert!(backend.read_file_symlink(p).is_none());
        backend.remove_file(p);
    }

    // read_text_file
    #[test]
    fn read_text_file_returns_none_when_missing() {
        assert!(read_text_file("/no/such/file.txt").is_none());
    }

    // remove_directory
    #[test]
    fn remove_directory_respects_recursive_flag() {
        let root = unique_temp_path("rmdir_root");
        let backend = NativeFileSystemBackend;
        let rp = root.to_str().unwrap();
        assert!(backend.make_directory(rp));
        assert!(backend.write_text_file(root.join("c.txt").to_str().unwrap(), "c"));
        // Non-recursive removal of a non-empty directory fails.
        assert!(!backend.remove_directory(rp, false));
        assert!(backend.directory_exists(rp));
        // A plain file is not a directory.
        let file = root.join("c.txt");
        assert!(!backend.remove_directory(file.to_str().unwrap(), false));
        // Recursive removal succeeds.
        assert!(backend.remove_directory(rp, true));
        assert!(!backend.directory_exists(rp));
    }

    // remove_file
    #[test]
    fn remove_file_returns_false_when_missing() {
        assert!(!remove_file("/no/such/file.txt"));
    }

    // rename_file
    #[test]
    fn rename_file_returns_false_when_missing() {
        let from = unique_temp_path("rename_missing_src.txt");
        let to = unique_temp_path("rename_missing_dst.txt");
        let backend = NativeFileSystemBackend;
        assert!(!backend.rename(from.to_str().unwrap(), to.to_str().unwrap()));
    }

    // rename_file
    #[test]
    fn rename_file_moves_existing() {
        let from = unique_temp_path("rename_src.txt");
        let to = unique_temp_path("rename_dst.txt");
        let backend = NativeFileSystemBackend;
        let fp = from.to_str().unwrap();
        let tp = to.to_str().unwrap();
        assert!(backend.write_text_file(fp, "moved"));
        assert!(backend.rename(fp, tp));
        assert!(!backend.file_exists(fp));
        assert_eq!(backend.read_text_file(tp).as_deref(), Some("moved"));
        backend.remove_file(tp);
    }

    // stat_file
    #[test]
    fn stat_file_returns_none_when_missing() {
        assert!(stat_file("/no/such/file.txt").is_none());
    }

    // stat_file
    #[test]
    fn stat_file_reports_size() {
        let path = unique_temp_path("stat.txt");
        let backend = NativeFileSystemBackend;
        let p = path.to_str().unwrap();
        assert!(backend.write_text_file(p, "12345"));
        let stat = backend.stat_file(p).expect("stat present");
        assert_eq!(stat.size, 5);
        assert!(!stat.is_directory);
        backend.remove_file(p);
    }

    // write_binary_file
    #[test]
    fn write_binary_file_roundtrip() {
        let path = unique_temp_path("binary.bin");
        let backend = NativeFileSystemBackend;
        let p = path.to_str().unwrap();
        let data = [0u8, 1, 2, 253, 254, 255];
        assert!(backend.write_binary_file(p, &data));
        assert_eq!(backend.read_binary_file(p).as_deref(), Some(&data[..]));
        backend.remove_file(p);
    }

    // write_dialog_handle_binary_file
    #[test]
    fn write_dialog_handle_binary_file_writes_by_path_and_rejects_null() {
        let path = unique_temp_path("dlg_write.bin");
        let p = path.to_str().unwrap();
        let handle = FileDialogHandle {
            kind: flighthq_types::FileDialogHandleKind::File,
            name: "dlg_write.bin".to_string(),
            path: Some(p.to_string()),
        };
        assert!(write_dialog_handle_binary_file(&handle, &[7, 8, 9]));
        let backend = NativeFileSystemBackend;
        assert_eq!(
            backend.read_binary_file(p).as_deref(),
            Some(&[7u8, 8, 9][..])
        );
        backend.remove_file(p);
        // A handle with no path is not writable on native.
        let null_handle = FileDialogHandle {
            kind: flighthq_types::FileDialogHandleKind::File,
            name: "x".to_string(),
            path: None,
        };
        assert!(!write_dialog_handle_binary_file(&null_handle, &[1]));
    }

    // write_dialog_handle_text_file
    #[test]
    fn write_dialog_handle_text_file_writes_by_path_and_rejects_null() {
        let path = unique_temp_path("dlg_write.txt");
        let p = path.to_str().unwrap();
        let handle = FileDialogHandle {
            kind: flighthq_types::FileDialogHandleKind::File,
            name: "dlg_write.txt".to_string(),
            path: Some(p.to_string()),
        };
        assert!(write_dialog_handle_text_file(&handle, "saved"));
        let backend = NativeFileSystemBackend;
        assert_eq!(backend.read_text_file(p).as_deref(), Some("saved"));
        backend.remove_file(p);
        let null_handle = FileDialogHandle {
            kind: flighthq_types::FileDialogHandleKind::File,
            name: "x".to_string(),
            path: None,
        };
        assert!(!write_dialog_handle_text_file(&null_handle, "x"));
    }

    // write_file_atomic
    #[test]
    fn write_file_atomic_replaces_destination() {
        let path = unique_temp_path("atomic.bin");
        let backend = NativeFileSystemBackend;
        let p = path.to_str().unwrap();
        assert!(backend.write_binary_file(p, &[0, 0, 0]));
        assert!(backend.write_file_atomic(p, &[1, 2, 3, 4]));
        assert_eq!(
            backend.read_binary_file(p).as_deref(),
            Some(&[1u8, 2, 3, 4][..])
        );
        // No temp sibling is left behind.
        assert!(!backend.file_exists(&format!("{p}.__atomic_tmp__")));
        backend.remove_file(p);
    }

    // write_text_file
    #[test]
    fn write_text_file_roundtrip() {
        let path = unique_temp_path("text.txt");
        let backend = NativeFileSystemBackend;
        let p = path.to_str().unwrap();
        assert!(backend.write_text_file(p, "hello world"));
        assert_eq!(backend.read_text_file(p).as_deref(), Some("hello world"));
        backend.remove_file(p);
    }
}
