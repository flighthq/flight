use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_audio::{
    AudioDecoderRegistry, AudioResourceFetch, AudioResourceReference, HostAudioDecodeCapabilities,
};
use flight_entity::{EntityRuntimeSlot, Ref, Uint8Array};
use flight_image::{ImageDecodeFallback, ImageResourceFetch, ImageResourceReference};
use flight_scene2d::{Node2DRef, Scene2DSlotReference, create_display_object};
use flight_signals::Signal;
use flight_stream::AbortSignal;

/// A renderer-neutral authored 2D graph and its enumerable resource sidecars.
pub struct Scene2DDocument {
    pub audio_resources: Vec<AudioResourceReference>,
    pub background_color: Option<u32>,
    pub image_resources: Vec<ImageResourceReference>,
    pub root: Node2DRef,
    pub slots: Vec<Ref<Scene2DSlotReference>>,
    pub source_kind: Option<String>,
    runtime: EntityRuntimeSlot,
}

/// Progress emitted while a caller-owned document fetcher acquires bytes.
#[derive(Clone)]
pub struct Scene2DDocumentFetchProgress {
    pub loaded: usize,
    pub total: usize,
    pub url: String,
}

/// Context supplied to importer matchers and importers.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Scene2DDocumentImportContext {
    pub mime_type: Option<String>,
    pub url: Option<String>,
}

/// Executor-neutral result of one document fetch.
pub type Scene2DDocumentFetchFuture =
    Pin<Box<dyn Future<Output = Option<Ref<Box<Uint8Array>>>> + Send>>;

/// Caller-owned URL acquisition seam.
pub type Scene2DDocumentFetcher = Arc<
    dyn Fn(
            String,
            AbortSignal,
            Option<Signal<Scene2DDocumentFetchProgress>>,
        ) -> Scene2DDocumentFetchFuture
        + Send
        + Sync,
>;

/// Synchronous format importer.
pub type Scene2DDocumentImporter = Arc<
    dyn Fn(&Uint8Array, &Scene2DDocumentImportContext) -> Option<Ref<Scene2DDocument>>
        + Send
        + Sync,
>;

/// Synchronous importer matcher.
pub type Scene2DDocumentImporterMatcher =
    Arc<dyn Fn(&Uint8Array, &Scene2DDocumentImportContext) -> bool + Send + Sync>;

/// One ordered importer registry entry.
#[derive(Clone)]
pub struct Scene2DDocumentImporterEntry {
    pub import_document: Scene2DDocumentImporter,
    pub kind: String,
    pub matches: Scene2DDocumentImporterMatcher,
}

/// Caller-owned, insertion-ordered importer registry.
#[derive(Clone, Default)]
pub struct Scene2DDocumentImporterRegistry {
    pub entries: Vec<Scene2DDocumentImporterEntry>,
}

/// Optional controls for document acquisition.
#[derive(Clone, Default)]
pub struct Scene2DDocumentLoadOptions {
    pub mime_type: Option<String>,
    pub progress: Option<Signal<Scene2DDocumentFetchProgress>>,
    pub signal: Option<AbortSignal>,
}

/// Application resolver for one authored slot.
pub type Scene2DSlotContentResolver =
    Arc<dyn Fn(&Ref<Scene2DSlotReference>) -> Option<Node2DRef> + Send + Sync>;

/// One successfully filled slot.
#[derive(Clone)]
pub struct Scene2DSlotResolution {
    pub content: Node2DRef,
    pub reference: Ref<Scene2DSlotReference>,
}

/// Result of resolving a caller-selected slot working set.
pub struct Scene2DResources {
    pub document: Ref<Scene2DDocument>,
    pub resolved: Vec<Scene2DSlotResolution>,
    pub root: Node2DRef,
    pub unresolved: Vec<Ref<Scene2DSlotReference>>,
}

/// Optional controls for synchronous slot resolution.
#[derive(Clone, Default)]
pub struct ResolveScene2DResourcesOptions {
    pub resolve_slot_content: Option<Scene2DSlotContentResolver>,
    pub select: Option<Arc<dyn Fn(&Ref<Scene2DSlotReference>) -> bool + Send + Sync>>,
}

/// Progress emitted after one selected image reference completes.
#[derive(Clone)]
pub struct Scene2DImageResourceLoadProgress {
    pub loaded: usize,
    pub reference: ImageResourceReference,
    pub total: usize,
}

/// Image-resolution result partitioned by authored reference.
pub struct Scene2DImageResources {
    pub document: Ref<Scene2DDocument>,
    pub resolved: Vec<ImageResourceReference>,
    pub unresolved: Vec<ImageResourceReference>,
}

/// Operation-scoped image loading seams.
#[derive(Clone, Default)]
pub struct LoadScene2DImageResourcesOptions {
    pub decode: Option<ImageDecodeFallback>,
    pub fetch: Option<ImageResourceFetch>,
    pub progress: Option<Signal<Scene2DImageResourceLoadProgress>>,
    pub select: Option<Arc<dyn Fn(&ImageResourceReference) -> bool + Send + Sync>>,
    pub signal: Option<AbortSignal>,
}

/// Progress emitted after one selected audio reference completes.
#[derive(Clone)]
pub struct Scene2DAudioResourceLoadProgress {
    pub loaded: usize,
    pub reference: AudioResourceReference,
    pub total: usize,
}

/// Audio-resolution result partitioned by authored reference.
pub struct Scene2DAudioResources {
    pub document: Ref<Scene2DDocument>,
    pub resolved: Vec<AudioResourceReference>,
    pub unresolved: Vec<AudioResourceReference>,
}

/// Operation-scoped audio loading seams.
#[derive(Clone, Default)]
pub struct LoadScene2DAudioResourcesOptions {
    pub audio_decode: Option<HostAudioDecodeCapabilities>,
    pub decoders: Option<AudioDecoderRegistry>,
    pub fetch: Option<AudioResourceFetch>,
    pub progress: Option<Signal<Scene2DAudioResourceLoadProgress>>,
    pub select: Option<Arc<dyn Fn(&AudioResourceReference) -> bool + Send + Sync>>,
    pub signal: Option<AbortSignal>,
}

/// One aggregate resource-coverage lane.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Scene2DResourceCoverageCount {
    pub resolved: usize,
    pub total: usize,
}

/// Document-wide live resource coverage.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Scene2DResourceCoverageExplanation {
    pub audio_resources: Scene2DResourceCoverageCount,
    pub complete: bool,
    pub image_resources: Scene2DResourceCoverageCount,
    pub required_slots: Scene2DResourceCoverageCount,
}

/// Operation that produced an expected resource sentinel.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scene2DResourceFailureOperation {
    CreateScene2DDocumentFromBytes,
    LoadScene2DAudioResources,
    LoadScene2DDocumentFromUrl,
    LoadScene2DImageResources,
    ResolveScene2DResources,
}

/// Stable reason for an expected resource sentinel.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scene2DResourceFailureReason {
    AudioResourcesUnresolved,
    DocumentFetchFailed,
    DocumentImportFailed,
    DocumentImporterMissing,
    ImageResourcesUnresolved,
    RequiredSlotsUnresolved,
}

/// Plain aggregate notice that never retains a document graph.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Scene2DResourceFailureNotice {
    pub operation: Scene2DResourceFailureOperation,
    pub reason: Scene2DResourceFailureReason,
    pub total: usize,
    pub unresolved: usize,
    pub url: Option<String>,
}

/// Optional diagnostic hook.
pub type Scene2DResourceFailureGuard = Arc<dyn Fn(&Scene2DResourceFailureNotice) + Send + Sync>;

/// Caller-owned replacement for the source module's guard slot and enabled flag.
#[derive(Clone, Default)]
pub struct Scene2DResourceFailureGuardState {
    pub enabled: bool,
    pub guard: Option<Scene2DResourceFailureGuard>,
}

/// Shared caller-owned resource failure guard state.
pub type Scene2DResourceFailureGuardStateRef = Ref<Scene2DResourceFailureGuardState>;

/// Live clock sampled by the opt-in logging guard.
// flight-lint: allow(f64) D1: injected operation timestamps use the log contract's millisecond number lane
pub type Scene2DResourceFailureClock = Arc<dyn Fn() -> f64 + Send + Sync>;

impl Default for Scene2DDocument {
    fn default() -> Self {
        return Self {
            audio_resources: Vec::new(),
            background_color: None,
            image_resources: Vec::new(),
            root: create_display_object(),
            runtime: EntityRuntimeSlot::default(),
            slots: Vec::new(),
            source_kind: None,
        };
    }
}

flight_entity::impl_entity!(Scene2DDocument);
