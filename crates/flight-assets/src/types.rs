use crate::enums::AssetLoadStatus;
use flight_entity::{EntityRuntimeSlot, Ref, Unknown};
use flight_loader::{ResourceLoadFuture, ResourceLoadResult, ResourceLoaderContext};
use flight_signals::Signal;
use flight_stream::SharedFuture;
use std::any::TypeId;
use std::collections::HashMap;
use std::sync::{Arc, RwLock, Weak};

pub type AssetType = String;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AssetDescriptor {
    pub id: String,
    pub url: String,
    pub r#type: AssetType,
    pub groups: Option<Vec<String>>,
}

pub type AssetManifest = Vec<Ref<AssetDescriptor>>;

#[derive(Clone)]
pub struct AssetLoaderAdapter<T> {
    pub load: Arc<dyn Fn(&Ref<AssetDescriptor>) -> ResourceLoadFuture<T> + Send + Sync>,
    pub dispose: Arc<dyn Fn(T) + Send + Sync>,
}

#[derive(Clone)]
pub struct AssetEntry {
    /// None is source undefined; Some(None) is a successfully loaded null Unknown.
    pub value: Option<Unknown>,
    pub refcount: usize,
    pub load_promise: Option<SharedFuture<ResourceLoadResult<Unknown>>>,
    pub resident: bool,
}

#[derive(Clone, Default)]
pub struct AssetLibraryRuntime {
    pub acquire_guard: Option<AssetAcquireGuard>,
    /// Each opaque slot retains the actual registered Ref<AssetLoaderAdapter<T>>.
    pub adapters: HashMap<AssetType, Unknown>,
    pub descriptors: HashMap<String, Ref<AssetDescriptor>>,
    pub entries: HashMap<String, Ref<AssetEntry>>,
    pub freed_ids: Vec<String>,
    pub groups: HashMap<String, Ref<Vec<String>>>,
    pub(crate) adapter_calls: HashMap<AssetType, AdapterCalls>,
    pub(crate) context: Option<ResourceLoaderContext>,
    pub(crate) entry_order: Vec<EntryOrder>,
    pub(crate) next_order: usize,
    pub(crate) projections: Vec<PromiseProjection>,
    pub(crate) warning_guard: Option<AssetAcquireGuard>,
}

#[derive(Clone, Default)]
pub struct AssetLibrary {
    /// The source library.runtime record, distinct from the Entity binding/uid slot.
    pub library_runtime: Ref<AssetLibraryRuntime>,
    runtime: EntityRuntimeSlot,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AssetLoadExplanation {
    pub id: String,
    pub ref_count: usize,
    pub status: AssetLoadStatus,
    pub r#type: Option<AssetType>,
}

pub type AssetAcquireGuard =
    Arc<dyn Fn(&Ref<AssetLibrary>, &Ref<AssetLoadExplanation>) + Send + Sync>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AssetLoadProgress {
    pub loaded: usize,
    pub total: usize,
}

#[derive(Clone, Default)]
pub struct AssetGroupLoadOptions {
    pub progress: Option<Ref<Signal<Ref<AssetLoadProgress>>>>,
}

#[derive(Clone)]
pub(crate) struct AdapterCalls {
    pub load: Arc<dyn Fn(&Ref<AssetDescriptor>) -> ResourceLoadFuture<Unknown> + Send + Sync>,
    pub dispose: Arc<dyn Fn(Unknown) + Send + Sync>,
}

#[derive(Clone)]
pub(crate) struct EntryOrder {
    pub order: usize,
    pub id: String,
    pub entry: Ref<AssetEntry>,
}

#[derive(Clone)]
pub(crate) struct PromiseProjection {
    pub entry: Weak<RwLock<AssetEntry>>,
    pub type_id: TypeId,
    pub promise: Unknown,
}

flight_entity::impl_entity!(AssetLibrary);
