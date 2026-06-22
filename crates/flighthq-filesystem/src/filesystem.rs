//! File system free functions backed by the [`FileSystemBackend`] seam.
//!
//! The backend trait and its shared data types ([`FileEntry`], [`FileStat`],
//! [`FileSystemPathKind`], [`FileWatchEvent`]) are defined in `flighthq-types`.

use std::path::PathBuf;
use std::sync::OnceLock;

use flighthq_types::{FileEntry, FileStat, FileSystemBackend, FileSystemPathKind, FileWatchEvent};

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
        if let Some(parent) = p.parent() {
            if std::fs::create_dir_all(parent).is_err() {
                return false;
            }
        }
        std::fs::write(p, data).is_ok()
    }

    fn read_binary_file(&self, path: &str) -> Option<Vec<u8>> {
        std::fs::read(path).ok()
    }

    fn write_binary_file(&self, path: &str, data: &[u8]) -> bool {
        let p = std::path::Path::new(path);
        if let Some(parent) = p.parent() {
            if std::fs::create_dir_all(parent).is_err() {
                return false;
            }
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
        if let Some(parent) = p.parent() {
            if std::fs::create_dir_all(parent).is_err() {
                return false;
            }
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

/// Copies a file from `from` to `to`. Returns `false` when the source is missing or denied.
pub fn copy_file(from: &str, to: &str) -> bool {
    get_backend().copy(from, to)
}

/// Returns `true` when a file or directory exists at `path`.
pub fn file_exists(path: &str) -> bool {
    get_backend().file_exists(path)
}

/// Returns the active file system backend.
pub fn get_file_system_backend() -> &'static dyn FileSystemBackend {
    get_backend()
}

/// Resolves a well-known host directory to an absolute path, or `""` when unavailable.
pub fn get_file_system_path(kind: FileSystemPathKind) -> String {
    get_backend().get_path(kind)
}

/// Creates a directory (and parents) at `path`. Returns `false` when denied.
pub fn make_directory(path: &str) -> bool {
    get_backend().make_directory(path)
}

/// Reads a file as raw bytes, or `None` when missing or access is denied.
pub fn read_binary_file(path: &str) -> Option<Vec<u8>> {
    get_backend().read_binary_file(path)
}

/// Lists directory entries. Returns `[]` when missing or access is denied.
pub fn read_directory(path: &str) -> Vec<FileEntry> {
    get_backend().read_directory(path)
}

/// Reads a file as a UTF-8 string, or `None` when missing or access is denied.
pub fn read_text_file(path: &str) -> Option<String> {
    get_backend().read_text_file(path)
}

/// Removes a file or directory at `path`. Returns `false` when missing or denied.
pub fn remove_file(path: &str) -> bool {
    get_backend().remove_file(path)
}

/// Renames or moves from `from` to `to`. Returns `false` when source is missing or denied.
pub fn rename_file(from: &str, to: &str) -> bool {
    get_backend().rename(from, to)
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

    // get_file_system_path
    #[test]
    fn get_file_system_path_temp() {
        let backend = NativeFileSystemBackend;
        let temp = backend.get_path(FileSystemPathKind::Temp);
        assert_eq!(temp, std::env::temp_dir().to_string_lossy());
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

    // read_binary_file
    #[test]
    fn read_binary_file_returns_none_when_missing() {
        assert!(read_binary_file("/no/such/file.bin").is_none());
    }

    // read_directory
    #[test]
    fn read_directory_returns_empty_when_missing() {
        assert!(read_directory("/no/such/dir").is_empty());
    }

    // read_text_file
    #[test]
    fn read_text_file_returns_none_when_missing() {
        assert!(read_text_file("/no/such/file.txt").is_none());
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
