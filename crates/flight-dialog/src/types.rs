use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_app::AppWindow;
use flight_entity::{EntityRuntimeSlot, FlightError, Record, Ref, Uint8Array};
use flight_host::ProviderRef;
use flight_stream::AbortSignal;

/// A provider Promise (D15), returned to the caller as is. `Err` is its rejection.
// flight-lint: allow(contract-vocabulary) D15/D10: rejected TS Promises need an explicit FlightError arm in Rust
pub type DialogProviderFuture<T> = Pin<Box<dyn Future<Output = Result<T, FlightError>> + Send>>;

/// One picker filter (TS `FileDialogFilter`): each MIME key owns exactly the extensions it
/// describes, in JS key order. Plain record.
#[derive(Clone, Debug)]
pub struct FileDialogFilter {
    pub accept: Record<Vec<String>>,
    pub name: String,
}

/// Whether a dialog handle names a file or a directory (TS `FileDialogHandle['kind']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileDialogHandleKind {
    File,
    Directory,
}

/// A file or directory chosen through a dialog (TS `FileDialogHandle extends Entity`), shared as a
/// `Ref<FileDialogHandle>`. On web `path` is `None`, because browsers cannot expose real host paths;
/// native hosts populate it. The provider-neutral file operations live in the private entity runtime
/// (`operations`), so a handle assembled from its public fields alone (a deserialized DTO or a forged
/// value) carries no runtime authority.
pub struct FileDialogHandle {
    runtime: EntityRuntimeSlot,
    pub kind: FileDialogHandleKind,
    pub name: String,
    pub path: Option<String>,
    pub(crate) operations: Option<FileDialogHandleOperations>,
}

/// A provider-neutral binary read: the bytes, or `None` (the source's `null`).
pub type FileDialogReadBinary = Arc<
    dyn Fn(Option<&AbortSignal>) -> DialogProviderFuture<Option<Box<Uint8Array>>> + Send + Sync,
>;

/// A provider-neutral text read: the text, or `None` (the source's `null`).
pub type FileDialogReadText =
    Arc<dyn Fn(Option<&AbortSignal>) -> DialogProviderFuture<Option<String>> + Send + Sync>;

/// A provider-neutral binary write, reporting whether it succeeded.
pub type FileDialogWriteBinary =
    Arc<dyn Fn(&Uint8Array, Option<&AbortSignal>) -> DialogProviderFuture<bool> + Send + Sync>;

/// A provider-neutral text write, reporting whether it succeeded.
pub type FileDialogWriteText =
    Arc<dyn Fn(&str, Option<&AbortSignal>) -> DialogProviderFuture<bool> + Send + Sync>;

/// The handle's runtime operations (TS `FileDialogHandleOperations`): provider-neutral, so
/// filesystem consumes them without knowing what the handle retains. `None` = an omitted operation.
#[derive(Clone, Default)]
pub struct FileDialogHandleOperations {
    pub read_binary: Option<FileDialogReadBinary>,
    pub read_text: Option<FileDialogReadText>,
    pub write_binary: Option<FileDialogWriteBinary>,
    pub write_text: Option<FileDialogWriteText>,
}

/// Options for `show_open_file_dialog` (TS `OpenFileDialogOptions`). Plain record.
#[derive(Clone, Default)]
pub struct OpenFileDialogOptions {
    pub filters: Option<Vec<FileDialogFilter>>,
    pub multiple: Option<bool>,
    pub signal: Option<AbortSignal>,
}

/// Options for `show_open_directory_dialog` (TS `OpenDirectoryDialogOptions`). Plain record.
#[derive(Clone, Default)]
pub struct OpenDirectoryDialogOptions {
    pub signal: Option<AbortSignal>,
}

/// Options for `show_save_file_dialog` (TS `SaveFileDialogOptions`). Plain record.
#[derive(Clone, Default)]
pub struct SaveFileDialogOptions {
    pub default_name: Option<String>,
    pub filters: Option<Vec<FileDialogFilter>>,
    pub signal: Option<AbortSignal>,
}

/// The selected files of an open-file dialog, in selection order. The source types the list as
/// non-empty (`[FileDialogHandle, ...FileDialogHandle[]]`); providers uphold that.
#[derive(Clone, Debug)]
pub struct FileDialogSelection {
    pub handles: Vec<Ref<FileDialogHandle>>,
}

/// The single handle of a directory-open or save dialog.
#[derive(Clone, Debug)]
pub struct FileDialogHandleSelection {
    pub handle: Ref<FileDialogHandle>,
}

/// TS `FileOpenDialogResult`.
#[derive(Clone, Debug)]
pub enum FileOpenDialogResult {
    Selected(FileDialogSelection),
    Cancelled,
    RuntimeUnavailable,
    SecurityDenied,
    FileOpenFailed,
}

/// TS `DirectoryOpenDialogResult`.
#[derive(Clone, Debug)]
pub enum DirectoryOpenDialogResult {
    Selected(FileDialogHandleSelection),
    Cancelled,
    RuntimeUnavailable,
    SecurityDenied,
    DirectoryOpenFailed,
}

/// TS `FileSaveDialogResult`.
#[derive(Clone, Debug)]
pub enum FileSaveDialogResult {
    Selected(FileDialogHandleSelection),
    Cancelled,
    RuntimeUnavailable,
    SecurityDenied,
    FileSaveFailed,
}

/// Options for `show_open_image_dialog` (TS `OpenImageDialogOptions`). Plain record.
#[derive(Clone, Default)]
pub struct OpenImageDialogOptions {
    pub signal: Option<AbortSignal>,
}

/// The camera a capture dialog prefers (TS `MediaCaptureDialogFacingMode`), matching the browser
/// file-input capture hint.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaCaptureDialogFacingMode {
    Environment,
    User,
}

/// Options for `show_capture_photo_dialog` (TS `CapturePhotoDialogOptions`). Plain record.
#[derive(Clone, Default)]
pub struct CapturePhotoDialogOptions {
    pub facing_mode: Option<MediaCaptureDialogFacingMode>,
    pub signal: Option<AbortSignal>,
}

/// Options for `show_capture_video_dialog` (TS `CaptureVideoDialogOptions`). Plain record.
#[derive(Clone, Default)]
pub struct CaptureVideoDialogOptions {
    pub facing_mode: Option<MediaCaptureDialogFacingMode>,
    pub signal: Option<AbortSignal>,
}

/// A chosen or captured image (TS `DialogImage`). Plain record.
#[derive(Clone, Debug, PartialEq)]
pub struct DialogImage {
    pub data_url: String,
    pub height: f32,
    pub mime_type: String,
    pub width: f32,
}

/// A captured video (TS `DialogVideo`). Plain record; `duration` is in seconds.
#[derive(Clone, Debug, PartialEq)]
pub struct DialogVideo {
    pub data_url: String,
    pub duration: f32,
    pub mime_type: String,
}

/// The selected image of an image-open dialog.
#[derive(Clone, Debug, PartialEq)]
pub struct DialogImageSelection {
    pub image: DialogImage,
}

/// The captured photo of a photo-capture dialog.
#[derive(Clone, Debug, PartialEq)]
pub struct DialogPhotoSelection {
    pub photo: DialogImage,
}

/// The captured video of a video-capture dialog.
#[derive(Clone, Debug, PartialEq)]
pub struct DialogVideoSelection {
    pub video: DialogVideo,
}

/// TS `ImageOpenDialogResult`.
#[derive(Clone, Debug, PartialEq)]
pub enum ImageOpenDialogResult {
    Selected(DialogImageSelection),
    Cancelled,
    RuntimeUnavailable,
    SecurityDenied,
    ImageOpenFailed,
}

/// TS `PhotoCaptureDialogResult`.
#[derive(Clone, Debug, PartialEq)]
pub enum PhotoCaptureDialogResult {
    Selected(DialogPhotoSelection),
    Cancelled,
    RuntimeUnavailable,
    SecurityDenied,
    PhotoCaptureFailed,
}

/// TS `VideoCaptureDialogResult`.
#[derive(Clone, Debug, PartialEq)]
pub enum VideoCaptureDialogResult {
    Selected(DialogVideoSelection),
    Cancelled,
    RuntimeUnavailable,
    SecurityDenied,
    VideoCaptureFailed,
}

/// Options for a text prompt dialog (TS `PromptDialogOptions`). Plain record.
#[derive(Clone, Default)]
pub struct PromptDialogOptions {
    pub title: Option<String>,
    pub message: String,
    pub default_value: Option<String>,
    pub placeholder: Option<String>,
    /// Native parent window to attach the modal dialog to; web backends ignore it.
    pub parent_window: Option<Ref<AppWindow>>,
    pub signal: Option<AbortSignal>,
}

/// A message dialog's severity (TS `MessageDialogKind`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MessageDialogKind {
    Info,
    Warning,
    Error,
    Question,
}

/// Options for a message dialog (TS `MessageDialogOptions`). Plain record.
#[derive(Clone, Default)]
pub struct MessageDialogOptions {
    pub title: Option<String>,
    pub message: String,
    pub detail: Option<String>,
    pub buttons: Option<Vec<String>>,
    pub kind: Option<MessageDialogKind>,
    /// Optional checkbox shown beneath the message; native hosts honor it.
    pub checkbox_label: Option<String>,
    /// Initial checked state of the checkbox.
    pub checkbox_checked: Option<bool>,
    /// Index of the button activated by Enter/default; native hosts honor it.
    pub default_id: Option<i32>,
    /// Index of the button activated by Escape/cancel; native hosts honor it.
    pub cancel_id: Option<i32>,
    /// Native parent window to attach the modal dialog to; web backends ignore it.
    pub parent_window: Option<Ref<AppWindow>>,
    pub signal: Option<AbortSignal>,
}

/// Outcome of a message dialog (TS `MessageDialogResult`): the pressed button, whether it was
/// cancelled (Escape / dismiss), and the final checkbox state. Plain record.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MessageDialogResult {
    pub button_index: i32,
    pub cancelled: bool,
    pub checkbox_checked: bool,
}

/// TS `HostDirectoryOpenDialogCapability`. `None` options = the source's omitted argument.
#[derive(Clone)]
pub struct HostDirectoryOpenDialogCapability {
    pub provider: ProviderRef,
    pub open: Arc<
        dyn Fn(
                Option<&OpenDirectoryDialogOptions>,
            ) -> DialogProviderFuture<DirectoryOpenDialogResult>
            + Send
            + Sync,
    >,
}

/// TS `HostFileOpenDialogCapability`.
#[derive(Clone)]
pub struct HostFileOpenDialogCapability {
    pub provider: ProviderRef,
    pub open: Arc<
        dyn Fn(&OpenFileDialogOptions) -> DialogProviderFuture<FileOpenDialogResult> + Send + Sync,
    >,
}

/// TS `HostFileSaveDialogCapability`.
#[derive(Clone)]
pub struct HostFileSaveDialogCapability {
    pub provider: ProviderRef,
    pub save: Arc<
        dyn Fn(&SaveFileDialogOptions) -> DialogProviderFuture<FileSaveDialogResult> + Send + Sync,
    >,
}

/// TS `HostImageOpenDialogCapability`. `None` options = the source's omitted argument.
#[derive(Clone)]
pub struct HostImageOpenDialogCapability {
    pub provider: ProviderRef,
    pub open: Arc<
        dyn Fn(Option<&OpenImageDialogOptions>) -> DialogProviderFuture<ImageOpenDialogResult>
            + Send
            + Sync,
    >,
}

/// TS `HostMessageDialogCapability`.
#[derive(Clone)]
pub struct HostMessageDialogCapability {
    pub provider: ProviderRef,
    pub confirm: Arc<dyn Fn(&MessageDialogOptions) -> DialogProviderFuture<bool> + Send + Sync>,
    pub message: Arc<
        dyn Fn(&MessageDialogOptions) -> DialogProviderFuture<MessageDialogResult> + Send + Sync,
    >,
}

/// TS `HostPhotoCaptureDialogCapability`. `None` options = the source's omitted argument.
#[derive(Clone)]
pub struct HostPhotoCaptureDialogCapability {
    pub provider: ProviderRef,
    pub capture: Arc<
        dyn Fn(Option<&CapturePhotoDialogOptions>) -> DialogProviderFuture<PhotoCaptureDialogResult>
            + Send
            + Sync,
    >,
}

/// TS `HostPromptDialogCapability`. The answer is the entered text, or `None` (the source's `null`).
#[derive(Clone)]
pub struct HostPromptDialogCapability {
    pub provider: ProviderRef,
    pub prompt:
        Arc<dyn Fn(&PromptDialogOptions) -> DialogProviderFuture<Option<String>> + Send + Sync>,
}

/// TS `HostVideoCaptureDialogCapability`. `None` options = the source's omitted argument.
#[derive(Clone)]
pub struct HostVideoCaptureDialogCapability {
    pub provider: ProviderRef,
    pub capture: Arc<
        dyn Fn(Option<&CaptureVideoDialogOptions>) -> DialogProviderFuture<VideoCaptureDialogResult>
            + Send
            + Sync,
    >,
}

/// Host dialog capability group (TS `HostDialogCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostDialogCapabilities {
    pub directory_open: Option<HostDirectoryOpenDialogCapability>,
    pub file_open: Option<HostFileOpenDialogCapability>,
    pub file_save: Option<HostFileSaveDialogCapability>,
    pub image_open: Option<HostImageOpenDialogCapability>,
    pub message: Option<HostMessageDialogCapability>,
    pub photo_capture: Option<HostPhotoCaptureDialogCapability>,
    pub prompt: Option<HostPromptDialogCapability>,
    pub video_capture: Option<HostVideoCaptureDialogCapability>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_file_dialog_handle sets the identity and runtime
impl Default for FileDialogHandle {
    fn default() -> Self {
        return FileDialogHandle {
            runtime: EntityRuntimeSlot::default(),
            kind: FileDialogHandleKind::File,
            name: String::new(),
            path: None,
            operations: None,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the operations are closures, so Debug reports which are present
impl fmt::Debug for FileDialogHandle {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("FileDialogHandle")
            .field("kind", &self.kind)
            .field("name", &self.name)
            .field("path", &self.path)
            .field("operations", &self.operations.is_some())
            .finish();
    }
}

flight_entity::impl_entity!(FileDialogHandle);
