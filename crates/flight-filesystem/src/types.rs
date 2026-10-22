use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{FlightError, Uint8Array};
use flight_host::ProviderRef;
use flight_stream::{AbortSignal, ReadableStream, WritableStream};

/// A provider Promise (D15). `Err` is its rejection, which reaches the caller unchanged; an abort
/// rejection carries the signal's reason as the typed panic payload (`throw_if_aborted`).
// flight-lint: allow(contract-vocabulary) D15/D10: rejected TS Promises need an explicit FlightError arm in Rust
pub type FileSystemProviderFuture<T> = Pin<Box<dyn Future<Output = Result<T, FlightError>> + Send>>;

/// The access a `can_access_file` query asks about (TS `'readable' | 'writable' | 'executable'`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileAccessMode {
    Executable,
    Readable,
    Writable,
}

/// Well-known host directories (TS `FileSystemPathKind`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileSystemPathKind {
    AppData,
    Cache,
    Desktop,
    Documents,
    Downloads,
    Home,
    Temp,
}

/// What changed under a watched path (TS `FileWatchEventType`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileWatchEventType {
    Created,
    Deleted,
    Modified,
}

/// The two data forms `write_file_atomic` declares (TS `Readonly<Uint8Array> | string`). Both arms
/// borrow the caller's data; the provider copies what it keeps.
pub enum FileAtomicWriteData<'a> {
    Bytes(FileAtomicWriteBytes<'a>),
    Text(FileAtomicWriteText<'a>),
}

/// Named payload for the byte arm.
pub struct FileAtomicWriteBytes<'a> {
    pub data: &'a Uint8Array,
}

/// Named payload for the text arm.
pub struct FileAtomicWriteText<'a> {
    pub data: &'a str,
}

/// One directory entry (TS `FileEntry`). Plain record.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

/// POSIX-style access bits (TS `FilePermissions`). Plain record.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FilePermissions {
    pub readable: bool,
    pub writable: bool,
    pub executable: bool,
}

/// File metadata (TS `FileStat`). `size` is a byte count; the times are the host's millisecond
/// timestamps. Plain record.
// flight-lint: allow(f64) D1: modified/created times are JS-number millisecond timestamps
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct FileStat {
    pub size: usize,
    pub is_directory: bool,
    pub modified_time: f64,
    pub created_time: f64,
    pub is_symlink: bool,
}

/// Disk or storage-quota usage in bytes (TS `FileSystemUsage`). Plain record.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FileSystemUsage {
    pub used_bytes: usize,
    pub quota_bytes: usize,
}

/// Options for a recursive directory walk (TS `FileWalkOptions`). `max_depth` `None` (or infinity)
/// walks the full tree; depth 0 is the entries directly inside the root. Plain record.
// flight-lint: allow(f64) D1: maxDepth is a JS number whose documented full-walk value is Infinity
#[derive(Clone, Default)]
pub struct FileWalkOptions {
    pub max_depth: Option<f64>,
    pub signal: Option<AbortSignal>,
}

/// One change under a watched path (TS `FileWatchEvent`; `type_` is the TS field `type`). Plain
/// record.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileWatchEvent {
    pub type_: FileWatchEventType,
    pub path: String,
}

/// A `watch_path` listener.
pub type FileWatchListener = Arc<dyn Fn(&FileWatchEvent) + Send + Sync>;

/// The unsubscribe `watch_path` returns.
pub type FileWatchUnsubscribe = Arc<dyn Fn() + Send + Sync>;

/// The required subset shared by Web OPFS and Capacitor Filesystem (TS
/// `FileSystemBasicOperations`): every member present. `HostFileSystemCapability` carries each of
/// these as an omittable member.
#[derive(Clone)]
pub struct FileSystemBasicOperations {
    pub append_text_file: Arc<
        dyn Fn(&str, &str, Option<&AbortSignal>) -> FileSystemProviderFuture<bool> + Send + Sync,
    >,
    pub copy: Arc<dyn Fn(&str, &str) -> FileSystemProviderFuture<bool> + Send + Sync>,
    pub directory_exists: Arc<dyn Fn(&str) -> FileSystemProviderFuture<bool> + Send + Sync>,
    pub file_exists: Arc<dyn Fn(&str) -> FileSystemProviderFuture<bool> + Send + Sync>,
    pub make_directory: Arc<dyn Fn(&str) -> FileSystemProviderFuture<bool> + Send + Sync>,
    pub read_binary_file: Arc<
        dyn Fn(&str, Option<&AbortSignal>) -> FileSystemProviderFuture<Option<Box<Uint8Array>>>
            + Send
            + Sync,
    >,
    pub read_directory: Arc<
        dyn Fn(&str, Option<&AbortSignal>) -> FileSystemProviderFuture<Vec<FileEntry>>
            + Send
            + Sync,
    >,
    pub read_text_file: Arc<
        dyn Fn(&str, Option<&AbortSignal>) -> FileSystemProviderFuture<Option<String>>
            + Send
            + Sync,
    >,
    pub remove_directory:
        Arc<dyn Fn(&str, Option<bool>) -> FileSystemProviderFuture<bool> + Send + Sync>,
    pub remove_file: Arc<dyn Fn(&str) -> FileSystemProviderFuture<bool> + Send + Sync>,
    pub rename: Arc<dyn Fn(&str, &str) -> FileSystemProviderFuture<bool> + Send + Sync>,
    pub stat_file: Arc<dyn Fn(&str) -> FileSystemProviderFuture<Option<FileStat>> + Send + Sync>,
    pub write_binary_file: Arc<
        dyn Fn(&str, &Uint8Array, Option<&AbortSignal>) -> FileSystemProviderFuture<bool>
            + Send
            + Sync,
    >,
    pub write_text_file: Arc<
        dyn Fn(&str, &str, Option<&AbortSignal>) -> FileSystemProviderFuture<bool> + Send + Sync,
    >,
}

/// The honest host-provider surface (TS `HostFileSystemCapability`): every member is omittable,
/// `None` being a provider that does not carry it. Symlink, permissions, real-path, watch and
/// well-known-path lookups are deliberately not members; the package owns their sentinels.
#[derive(Clone)]
pub struct HostFileSystemCapability {
    pub provider: ProviderRef,
    pub append_text_file: Option<
        Arc<
            dyn Fn(&str, &str, Option<&AbortSignal>) -> FileSystemProviderFuture<bool>
                + Send
                + Sync,
        >,
    >,
    pub can_access_file:
        Option<Arc<dyn Fn(&str, FileAccessMode) -> FileSystemProviderFuture<bool> + Send + Sync>>,
    pub copy: Option<Arc<dyn Fn(&str, &str) -> FileSystemProviderFuture<bool> + Send + Sync>>,
    pub directory_exists: Option<Arc<dyn Fn(&str) -> FileSystemProviderFuture<bool> + Send + Sync>>,
    pub file_exists: Option<Arc<dyn Fn(&str) -> FileSystemProviderFuture<bool> + Send + Sync>>,
    pub get_file_system_usage:
        Option<Arc<dyn Fn() -> FileSystemProviderFuture<Option<FileSystemUsage>> + Send + Sync>>,
    pub make_directory: Option<Arc<dyn Fn(&str) -> FileSystemProviderFuture<bool> + Send + Sync>>,
    pub open_file_read_stream: Option<
        Arc<
            dyn Fn(&str, Option<&AbortSignal>) -> FileSystemProviderFuture<Option<ReadableStream>>
                + Send
                + Sync,
        >,
    >,
    pub open_file_write_stream: Option<
        Arc<
            dyn Fn(&str, Option<&AbortSignal>) -> FileSystemProviderFuture<Option<WritableStream>>
                + Send
                + Sync,
        >,
    >,
    pub read_binary_file: Option<
        Arc<
            dyn Fn(&str, Option<&AbortSignal>) -> FileSystemProviderFuture<Option<Box<Uint8Array>>>
                + Send
                + Sync,
        >,
    >,
    pub read_binary_file_range: Option<
        Arc<
            dyn Fn(
                    &str,
                    usize,
                    usize,
                    Option<&AbortSignal>,
                ) -> FileSystemProviderFuture<Option<Box<Uint8Array>>>
                + Send
                + Sync,
        >,
    >,
    pub read_directory: Option<
        Arc<
            dyn Fn(&str, Option<&AbortSignal>) -> FileSystemProviderFuture<Vec<FileEntry>>
                + Send
                + Sync,
        >,
    >,
    pub read_directory_recursive: Option<
        Arc<
            dyn Fn(&str, Option<&FileWalkOptions>) -> FileSystemProviderFuture<Vec<FileEntry>>
                + Send
                + Sync,
        >,
    >,
    pub read_text_file: Option<
        Arc<
            dyn Fn(&str, Option<&AbortSignal>) -> FileSystemProviderFuture<Option<String>>
                + Send
                + Sync,
        >,
    >,
    pub remove_directory:
        Option<Arc<dyn Fn(&str, Option<bool>) -> FileSystemProviderFuture<bool> + Send + Sync>>,
    pub remove_file: Option<Arc<dyn Fn(&str) -> FileSystemProviderFuture<bool> + Send + Sync>>,
    pub rename: Option<Arc<dyn Fn(&str, &str) -> FileSystemProviderFuture<bool> + Send + Sync>>,
    pub stat_file:
        Option<Arc<dyn Fn(&str) -> FileSystemProviderFuture<Option<FileStat>> + Send + Sync>>,
    pub write_binary_file: Option<
        Arc<
            dyn Fn(&str, &Uint8Array, Option<&AbortSignal>) -> FileSystemProviderFuture<bool>
                + Send
                + Sync,
        >,
    >,
    pub write_file_atomic: Option<
        Arc<
            dyn Fn(
                    &str,
                    FileAtomicWriteData<'_>,
                    Option<&AbortSignal>,
                ) -> FileSystemProviderFuture<bool>
                + Send
                + Sync,
        >,
    >,
    pub write_text_file: Option<
        Arc<
            dyn Fn(&str, &str, Option<&AbortSignal>) -> FileSystemProviderFuture<bool>
                + Send
                + Sync,
        >,
    >,
}

/// Host file-system capability group (TS `HostFileSystemCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostFileSystemCapabilities {
    pub access: Option<HostFileSystemCapability>,
}
