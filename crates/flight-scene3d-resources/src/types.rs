use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Kind, Ref};
use flight_image::{
    ImageResolverState, ImageResourceFailure, ImageResourceFetch, ImageResourceReference,
};
use flight_image_codec::HostImageDecodeCapabilities;
use flight_loader::{LoadProgress, ResourceLoader, ResourceLoaderContext};
use flight_materials::{Material, PbrExtension};
use flight_importdiagnostics::ImportDiagnostic;
use flight_scene3d::Scene3D;
use flight_scene3d_formats::{GltfCoreFeatureHandler, GltfExtensionHandler};
use flight_signals::{Signal, SlotId};
use flight_stream::{AbortController, AbortSignal, SharedFuture};
use flight_texture::{Texture, TextureSourceRef};
use flight_tween::EasingFunction;

/// Appends one material's non-null textures to `out` without clearing it.
// flight-lint: allow(contract-vocabulary) D9d stored lister callback reads the open Material family by reference
pub type Scene3DMaterialTextureLister =
    Arc<dyn Fn(&dyn Material, &mut Vec<Ref<Texture>>) + Send + Sync>;

/// Appends one PBR extension's non-null textures to `out` without clearing it.
pub type Scene3DPbrExtensionTextureLister =
    Arc<dyn Fn(&PbrExtension, &mut Vec<Ref<Texture>>) + Send + Sync>;

/// Kind-keyed texture discovery tables. Both tables are shared handles, so every copy of a registry
/// (the caller's, a resolver's, a lister closure's) reads and registers into the same TS `Map`.
#[derive(Clone, Default)]
pub struct Scene3DMaterialTextureRegistry {
    pub extension_listers: Ref<HashMap<Kind, Scene3DPbrExtensionTextureLister>>,
    pub listers: Ref<HashMap<Kind, Scene3DMaterialTextureLister>>,
}

/// One resource identity and the texture subscriber an availability signal reports.
#[derive(Clone)]
pub struct Scene3DResourceEvent {
    pub reference: ImageResourceReference,
    pub texture: Ref<Texture>,
}

/// Lazily enabled availability signals of one resolver.
#[derive(Clone, Default)]
pub struct Scene3DResourceSignals {
    pub on_resource_failed: Signal<Scene3DResourceEvent>,
    pub on_resource_resolved: Signal<Scene3DResourceEvent>,
    runtime: EntityRuntimeSlot,
}

/// The public, caller-composable resolver atom. Queueing, settled-source retention, subscribers and
/// optional signals are private runtime state reached through named functions.
pub struct Scene3DResourceResolver {
    pub fetch: ImageResourceFetch,
    pub image_decode: Option<Arc<HostImageDecodeCapabilities>>,
    pub registry: Scene3DMaterialTextureRegistry,
    pub(crate) state: Ref<Scene3DResourceResolverRuntime>,
    runtime: EntityRuntimeSlot,
}

/// TS `Scene3DResourceResolver & { [Scene3DResourceResolverRuntimeKey]: … }`: in Rust the private
/// runtime is a field of the resolver itself, so both names denote one struct.
pub type Scene3DResourceResolverWithRuntime = Scene3DResourceResolver;

/// Optional resolver seams; every field defaults as in the source.
#[derive(Clone, Default)]
pub struct Scene3DResourceResolverOptions {
    pub fetch: Option<ImageResourceFetch>,
    pub image_decode: Option<Arc<HostImageDecodeCapabilities>>,
    pub max_concurrent: Option<f32>,
    pub registry: Option<Scene3DMaterialTextureRegistry>,
}

/// D5 host services retained by a resolver: the loader's spawn/timer context, which also drives each
/// request's settle continuation, and the caller-owned image resolver state the source keeps in a
/// module global.
#[derive(Clone)]
pub struct Scene3DResourceResolverContext {
    pub image_resolver: Ref<ImageResolverState>,
    pub loader: ResourceLoaderContext,
}

/// One resource identity's private in-flight resolution. Several sampled textures may share one image
/// resource while retaining independent sampler, color and UV state.
pub struct Scene3DResourceInFlight {
    pub controller: AbortController,
    pub promise: SharedFuture<()>,
    pub subscribers: Vec<Ref<Texture>>,
}

/// Private resolver machinery, the TS value under `Scene3DResourceResolverRuntimeKey`. The in-flight
/// table keeps the source `Map`'s insertion order; settled sources are an identity lookup.
#[derive(Default)]
pub struct Scene3DResourceResolverRuntime {
    pub in_flight: Vec<(ImageResourceReference, Ref<Scene3DResourceInFlight>)>,
    pub loader: Ref<ResourceLoader>,
    pub resolved: HashMap<usize, (ImageResourceReference, TextureSourceRef)>,
    pub signals: Option<Ref<Scene3DResourceSignals>>,
    pub(crate) context: Option<Scene3DResourceResolverContext>,
    pub(crate) failure_guard: Option<Scene3DResourceFailureGuardSlots>,
    pub(crate) failure_attempt: u64,
}

/// The two connections an installed failure guard holds on the resolver's signals.
#[derive(Clone, Copy)]
pub(crate) struct Scene3DResourceFailureGuardSlots {
    pub(crate) failed: SlotId,
    pub(crate) resolved: SlotId,
}

/// One byte-progress tick for a source taking part in document acquisition. It is the loader's own
/// progress record, so a caller's signal is forwarded to the transport unchanged.
pub type Scene3DDocumentLoadProgress = LoadProgress;

/// Optional controls for document acquisition.
#[derive(Clone, Default)]
pub struct Scene3DDocumentLoadOptions {
    pub progress: Option<Ref<Signal<Ref<Scene3DDocumentLoadProgress>>>>,
    pub signal: Option<AbortSignal>,
}

/// glTF URL acquisition plus the caller-owned synchronous parser opt-ins. Diagnostics report
/// unsupported required extensions; an unhandled extension named only in `extensionsUsed` is silent.
#[derive(Clone, Default)]
pub struct GltfScene3DDocumentLoadOptions {
    pub core_feature_handlers: Option<Vec<Ref<GltfCoreFeatureHandler>>>,
    pub diagnostics: Option<Ref<Vec<ImportDiagnostic>>>,
    pub extension_handlers: Option<Vec<Ref<GltfExtensionHandler>>>,
    pub progress: Option<Ref<Signal<Ref<Scene3DDocumentLoadProgress>>>>,
    pub signal: Option<AbortSignal>,
}

/// Progress emitted while one load operation's selected references settle.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Scene3DResourceLoadProgress {
    pub loaded: usize,
    pub total: usize,
}

/// Selects which texture subscribers join a working set.
pub type Scene3DResourceSelect =
    Arc<dyn Fn(&Ref<Texture>, &ImageResourceReference) -> bool + Send + Sync>;

/// Ranks a texture subscriber for acquisition; the loader takes the largest first.
pub type Scene3DResourcePriority =
    Arc<dyn Fn(&Ref<Texture>, &ImageResourceReference) -> f32 + Send + Sync>;

/// Optional controls for synchronous working-set reconciliation.
#[derive(Clone, Default)]
pub struct ResolveScene3DResourcesOptions {
    pub select: Option<Scene3DResourceSelect>,
}

/// Optional controls for a progressive streaming pass.
#[derive(Clone, Default)]
pub struct UpdateScene3DResourceStreamingOptions {
    pub priority: Option<Scene3DResourcePriority>,
    pub select: Option<Scene3DResourceSelect>,
}

/// Optional controls for an eager load operation.
#[derive(Clone, Default)]
pub struct LoadScene3DResourcesOptions {
    pub priority: Option<Scene3DResourcePriority>,
    pub progress: Option<Signal<Scene3DResourceLoadProgress>>,
    pub select: Option<Scene3DResourceSelect>,
}

/// One resource identity and the selected textures that subscribe to it.
#[derive(Clone)]
pub struct Scene3DResourceWorkingSet {
    pub reference: ImageResourceReference,
    pub textures: Vec<Ref<Texture>>,
}

/// One resolved working-set group with the ready source bound to every subscriber.
#[derive(Clone)]
pub struct Scene3DResourceResolution {
    pub reference: ImageResourceReference,
    pub source: TextureSourceRef,
    pub textures: Vec<Ref<Texture>>,
}

/// One synchronous selected-working-set snapshot.
pub struct Scene3DResources {
    pub resolved: Vec<Scene3DResourceResolution>,
    pub scene: Ref<Scene3D>,
    pub unresolved: Vec<Scene3DResourceWorkingSet>,
}

/// Optional controls for the streamed-texture fade-in.
#[derive(Clone, Default)]
pub struct Scene3DResourceRevealOptions {
    pub ease: Option<EasingFunction>,
    pub fade_seconds: Option<f32>,
    pub from: Option<f32>,
}

/// Live clock sampled by the opt-in failure guard.
// flight-lint: allow(f64) D1: injected operation timestamps use the log contract's millisecond number lane
pub type Scene3DResourceFailureClock = Arc<dyn Fn() -> f64 + Send + Sync>;

/// Reason one failed image attempt carried, kept so a repeated event for the same attempt stays quiet.
pub(crate) type Scene3DResourceFailureIdentity = Option<Ref<ImageResourceFailure>>;

impl Default for Scene3DResourceResolver {
    fn default() -> Self {
        return Self {
            fetch: Arc::new(|_, _| Box::pin(async { None })),
            image_decode: None,
            registry: Scene3DMaterialTextureRegistry::default(),
            state: flight_entity::Ref::default(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

flight_entity::impl_entity!(Scene3DResourceResolver);
flight_entity::impl_entity!(Scene3DResourceSignals);
