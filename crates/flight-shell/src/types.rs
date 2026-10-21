use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_stream::{
    ReadableStream, SharedFuture, WritableStream, create_readable_stream, create_shared_future,
    create_writable_stream,
};

/// The per-call external URL allow policy (TS `ShellExternalUrlPolicy`). Scheme names omit the
/// trailing colon. There is deliberately no default allowlist: an empty policy blocks every URL.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ShellExternalUrlPolicy {
    pub allowed_schemes: Vec<String>,
}

/// The reason arm of an external URL outcome (TS `ShellExternalOutcome['reason']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShellExternalReason {
    BlockedScheme,
    Ok,
    OperationFailed,
    PopupBlocked,
}

/// What happened when an external URL was handed to the host (TS `ShellExternalOutcome`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShellExternalOutcome {
    pub reason: ShellExternalReason,
}

/// The reason arm of a path-open outcome (TS `ShellPathOpenOutcome['reason']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShellPathOpenReason {
    Ok,
    OperationFailed,
}

/// The successful path-open arm, which carries no failure message.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShellPathOpenOutcomeOk {}

/// The failed path-open arm, which carries the provider's message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShellPathOpenOutcomeOperationFailed {
    pub message: String,
}

/// What happened when a path was opened (TS `ShellPathOpenOutcome`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ShellPathOpenOutcome {
    Ok(ShellPathOpenOutcomeOk),
    OperationFailed(ShellPathOpenOutcomeOperationFailed),
}

/// The reason arm of a reveal outcome (TS `ShellPathRevealOutcome['reason']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShellPathRevealReason {
    Ok,
    OperationFailed,
}

/// What happened when a path was revealed (TS `ShellPathRevealOutcome`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShellPathRevealOutcome {
    pub reason: ShellPathRevealReason,
}

/// A Windows shell shortcut link (TS `ShellShortcutLink`). `target` is the path the shortcut
/// points to; the remaining fields are optional metadata populated by the provider.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ShellShortcutLink {
    pub target: String,
    pub app_user_model_id: Option<String>,
    pub args: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub icon_index: Option<i32>,
    pub working_directory: Option<String>,
}

/// The reason arm of a shortcut-link read outcome (TS `ShellShortcutLinkReadOutcome['reason']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShellShortcutLinkReadReason {
    Ok,
    OperationFailed,
}

/// The successful shortcut-link read arm, which carries the parsed link.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShellShortcutLinkReadOutcomeOk {
    pub link: ShellShortcutLink,
}

/// The failed shortcut-link read arm, which carries the provider's message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShellShortcutLinkReadOutcomeOperationFailed {
    pub message: String,
}

/// What happened when a shortcut link was read (TS `ShellShortcutLinkReadOutcome`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ShellShortcutLinkReadOutcome {
    Ok(ShellShortcutLinkReadOutcomeOk),
    OperationFailed(ShellShortcutLinkReadOutcomeOperationFailed),
}

/// The reason arm of a shortcut-link write outcome (TS `ShellShortcutLinkWriteOutcome['reason']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShellShortcutLinkWriteReason {
    Ok,
    OperationFailed,
}

/// What happened when a shortcut link was written (TS `ShellShortcutLinkWriteOutcome`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShellShortcutLinkWriteOutcome {
    pub reason: ShellShortcutLinkWriteReason,
}

/// How `write_shell_shortcut_link` applies a link at a path (TS `ShellShortcutWriteOperation`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShellShortcutWriteOperation {
    Create,
    Replace,
    Update,
}

/// The reason arm of a trash outcome (TS `ShellTrashOutcome['reason']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShellTrashReason {
    Ok,
    OperationFailed,
}

/// What happened when one path was moved to the trash (TS `ShellTrashOutcome`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShellTrashOutcome {
    pub reason: ShellTrashReason,
}

/// Options for one argument-vector child process (TS `ShellProcessOptions`). Environment entries
/// are literal strings; command parsing, shell expansion and ambient shell selection are outside
/// this seam.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ShellProcessOptions {
    pub cwd: Option<String>,
    pub environment: Option<HashMap<String, String>>,
}

/// Terminal process status (TS `ShellProcessExitStatus`). A normal exit has a numeric code and no
/// signal; signal termination has no code and the provider's literal signal name.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ShellProcessExitStatus {
    pub code: Option<i32>,
    pub signal: Option<String>,
}

/// A live provider-owned child process (TS `ShellProcess`, an Entity). `exit` is a shared,
/// re-awaitable promise whose observers keep the exact resolved status identity; stdin, stdout and
/// stderr are the D20 byte streams; `terminate` is the source's stored callback.
pub struct ShellProcess {
    runtime: EntityRuntimeSlot,
    pub exit: SharedFuture<Ref<ShellProcessExitStatus>>,
    pub stderr: ReadableStream,
    pub stdin: WritableStream,
    pub stdout: ReadableStream,
    pub terminate: Arc<dyn Fn() + Send + Sync>,
}

/// Boxed Send future for an external URL outcome (D15).
pub type ShellExternalFuture = Pin<Box<dyn Future<Output = ShellExternalOutcome> + Send>>;

/// Boxed Send future for a path-open outcome (D15).
pub type ShellPathOpenFuture = Pin<Box<dyn Future<Output = ShellPathOpenOutcome> + Send>>;

/// Boxed Send future for a path-reveal outcome (D15).
pub type ShellPathRevealFuture = Pin<Box<dyn Future<Output = ShellPathRevealOutcome> + Send>>;

/// Boxed Send future for a shortcut-link read outcome (D15).
pub type ShellShortcutLinkReadFuture =
    Pin<Box<dyn Future<Output = ShellShortcutLinkReadOutcome> + Send>>;

/// Boxed Send future for a shortcut-link write outcome (D15).
pub type ShellShortcutLinkWriteFuture =
    Pin<Box<dyn Future<Output = ShellShortcutLinkWriteOutcome> + Send>>;

/// Boxed Send future for a trash outcome (D15).
pub type ShellTrashFuture = Pin<Box<dyn Future<Output = ShellTrashOutcome> + Send>>;

/// One host capability record (TS `HostShellBeepCapability`).
#[derive(Clone)]
pub struct HostShellBeepCapability {
    pub beep: Arc<dyn Fn() + Send + Sync>,
}

/// One host capability record (TS `HostShellExternalCapability`). The URL is owned because a D15
/// boxed future is `Send + 'static` and cannot borrow the caller's string.
#[derive(Clone)]
pub struct HostShellExternalCapability {
    pub open: Arc<dyn Fn(String) -> ShellExternalFuture + Send + Sync>,
}

/// One host capability record (TS `HostShellPathOpenCapability`).
#[derive(Clone)]
pub struct HostShellPathOpenCapability {
    pub open: Arc<dyn Fn(String) -> ShellPathOpenFuture + Send + Sync>,
}

/// One host capability record (TS `HostShellPathRevealCapability`).
#[derive(Clone)]
pub struct HostShellPathRevealCapability {
    pub reveal: Arc<dyn Fn(String) -> ShellPathRevealFuture + Send + Sync>,
}

/// One host capability record (TS `HostShellProcessCapability`). Spawn is asynchronous work with
/// a synchronously returned live handle; completion is observed through `ShellProcess.exit`, and
/// the backend receives an argument vector rather than a shell command string to parse.
#[derive(Clone)]
pub struct HostShellProcessCapability {
    pub spawn:
        Arc<dyn Fn(&str, &[String], Option<&ShellProcessOptions>) -> ShellProcess + Send + Sync>,
}

/// One host capability record (TS `HostShellShortcutLinkCapability`). The link is owned because a
/// D15 boxed future cannot borrow it.
#[derive(Clone)]
pub struct HostShellShortcutLinkCapability {
    pub read: Arc<dyn Fn(String) -> ShellShortcutLinkReadFuture + Send + Sync>,
    pub write: Arc<
        dyn Fn(
                String,
                ShellShortcutLink,
                ShellShortcutWriteOperation,
            ) -> ShellShortcutLinkWriteFuture
            + Send
            + Sync,
    >,
}

/// One host capability record (TS `HostShellTrashCapability`).
#[derive(Clone)]
pub struct HostShellTrashCapability {
    pub move_to_trash: Arc<dyn Fn(String) -> ShellTrashFuture + Send + Sync>,
}

/// The shell capability group (TS `HostShellCapabilities`). An omitted slot is capability absence,
/// never a provider whose methods return unsupported sentinels.
#[derive(Clone, Default)]
pub struct HostShellCapabilities {
    pub beep: Option<HostShellBeepCapability>,
    pub external: Option<HostShellExternalCapability>,
    pub path_open: Option<HostShellPathOpenCapability>,
    pub path_reveal: Option<HostShellPathRevealCapability>,
    pub process: Option<HostShellProcessCapability>,
    pub shortcut_link: Option<HostShellShortcutLinkCapability>,
    pub trash: Option<HostShellTrashCapability>,
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellExternalOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn get_shell_external_reason_string(value: ShellExternalReason) -> &'static str {
    return match value {
        ShellExternalReason::BlockedScheme => "blocked-scheme",
        ShellExternalReason::Ok => "ok",
        ShellExternalReason::OperationFailed => "operation-failed",
        ShellExternalReason::PopupBlocked => "popup-blocked",
    };
}

// flight-lint: allow(conform-extra) Rust accessor for the TS discriminated-union reason field; TS reads `outcome.reason` directly
pub fn get_shell_path_open_outcome_reason(value: &ShellPathOpenOutcome) -> ShellPathOpenReason {
    return match value {
        ShellPathOpenOutcome::Ok(_) => ShellPathOpenReason::Ok,
        ShellPathOpenOutcome::OperationFailed(_) => ShellPathOpenReason::OperationFailed,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellPathOpenOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn get_shell_path_open_reason_string(value: ShellPathOpenReason) -> &'static str {
    return match value {
        ShellPathOpenReason::Ok => "ok",
        ShellPathOpenReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellPathRevealOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn get_shell_path_reveal_reason_string(value: ShellPathRevealReason) -> &'static str {
    return match value {
        ShellPathRevealReason::Ok => "ok",
        ShellPathRevealReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) Rust accessor for the TS discriminated-union reason field; TS reads `outcome.reason` directly
pub fn get_shell_shortcut_link_read_outcome_reason(
    value: &ShellShortcutLinkReadOutcome,
) -> ShellShortcutLinkReadReason {
    return match value {
        ShellShortcutLinkReadOutcome::Ok(_) => ShellShortcutLinkReadReason::Ok,
        ShellShortcutLinkReadOutcome::OperationFailed(_) => {
            ShellShortcutLinkReadReason::OperationFailed
        }
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellShortcutLinkReadOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn get_shell_shortcut_link_read_reason_string(
    value: ShellShortcutLinkReadReason,
) -> &'static str {
    return match value {
        ShellShortcutLinkReadReason::Ok => "ok",
        ShellShortcutLinkReadReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellShortcutLinkWriteOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn get_shell_shortcut_link_write_reason_string(
    value: ShellShortcutLinkWriteReason,
) -> &'static str {
    return match value {
        ShellShortcutLinkWriteReason::Ok => "ok",
        ShellShortcutLinkWriteReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellShortcutWriteOperation union; the TS package exports no get_/parse_ free functions
pub fn get_shell_shortcut_write_operation_string(
    value: ShellShortcutWriteOperation,
) -> &'static str {
    return match value {
        ShellShortcutWriteOperation::Create => "create",
        ShellShortcutWriteOperation::Replace => "replace",
        ShellShortcutWriteOperation::Update => "update",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellTrashOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn get_shell_trash_reason_string(value: ShellTrashReason) -> &'static str {
    return match value {
        ShellTrashReason::Ok => "ok",
        ShellTrashReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellExternalOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn parse_shell_external_reason(value: &str) -> Option<ShellExternalReason> {
    return match value {
        "blocked-scheme" => Some(ShellExternalReason::BlockedScheme),
        "ok" => Some(ShellExternalReason::Ok),
        "operation-failed" => Some(ShellExternalReason::OperationFailed),
        "popup-blocked" => Some(ShellExternalReason::PopupBlocked),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellPathOpenOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn parse_shell_path_open_reason(value: &str) -> Option<ShellPathOpenReason> {
    return match value {
        "ok" => Some(ShellPathOpenReason::Ok),
        "operation-failed" => Some(ShellPathOpenReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellPathRevealOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn parse_shell_path_reveal_reason(value: &str) -> Option<ShellPathRevealReason> {
    return match value {
        "ok" => Some(ShellPathRevealReason::Ok),
        "operation-failed" => Some(ShellPathRevealReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellShortcutLinkReadOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn parse_shell_shortcut_link_read_reason(value: &str) -> Option<ShellShortcutLinkReadReason> {
    return match value {
        "ok" => Some(ShellShortcutLinkReadReason::Ok),
        "operation-failed" => Some(ShellShortcutLinkReadReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellShortcutLinkWriteOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn parse_shell_shortcut_link_write_reason(value: &str) -> Option<ShellShortcutLinkWriteReason> {
    return match value {
        "ok" => Some(ShellShortcutLinkWriteReason::Ok),
        "operation-failed" => Some(ShellShortcutLinkWriteReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellShortcutWriteOperation union; the TS package exports no get_/parse_ free functions
pub fn parse_shell_shortcut_write_operation(value: &str) -> Option<ShellShortcutWriteOperation> {
    return match value {
        "create" => Some(ShellShortcutWriteOperation::Create),
        "replace" => Some(ShellShortcutWriteOperation::Replace),
        "update" => Some(ShellShortcutWriteOperation::Update),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ShellTrashOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn parse_shell_trash_reason(value: &str) -> Option<ShellTrashReason> {
    return match value {
        "ok" => Some(ShellTrashReason::Ok),
        "operation-failed" => Some(ShellTrashReason::OperationFailed),
        _ => None,
    };
}

impl Default for ShellProcess {
    fn default() -> Self {
        return ShellProcess {
            runtime: EntityRuntimeSlot::default(),
            exit: create_shared_future(Box::pin(async {
                Arc::new(RwLock::new(ShellProcessExitStatus {
                    code: None,
                    signal: None,
                }))
            })),
            stderr: create_readable_stream(Box::new(futures::io::empty())),
            stdin: create_writable_stream(Box::new(futures::io::sink())),
            stdout: create_readable_stream(Box::new(futures::io::empty())),
            terminate: Arc::new(|| {}),
        };
    }
}

flight_entity::impl_entity!(ShellProcess);
