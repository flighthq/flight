use crate::asset_library::*;
use crate::enable_asset_guards::*;
use crate::explain_asset_load::*;
use crate::types::*;
use flight_entity::Ref;
use flight_loader::{ResourceLoadResult, ResourceLoaderContext};
use flight_log::LogStateRef;
use flight_stream::SharedFuture;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::enums::AssetLoadStatus;
    use crate::test_host::MockHost;
    use flight_entity::{get_entity_uid, set_entity_uid};
    use flight_log::create_log_state;
    use futures::FutureExt;
    use std::sync::{Arc, Mutex, RwLock};

    fn context(host: &MockHost) -> ResourceLoaderContext {
        return ResourceLoaderContext {
            spawn: host.spawn(),
            timers: host.timers(),
        };
    }
    fn library(host: &MockHost) -> Ref<AssetLibrary> {
        return create_asset_library(&context(host));
    }
    fn descriptor(id: &str) -> Ref<AssetDescriptor> {
        return Arc::new(RwLock::new(AssetDescriptor {
            id: id.to_string(),
            url: format!("{id}.bin"),
            r#type: "vendor.resource".to_string(),
            groups: Some(vec!["g".to_string()]),
        }));
    }
    fn adapter(freed: Arc<Mutex<Vec<String>>>) -> Ref<AssetLoaderAdapter<String>> {
        return Arc::new(RwLock::new(AssetLoaderAdapter {
            load: Arc::new(|descriptor| {
                let value = descriptor.read().unwrap().id.clone();
                Box::pin(async move { Ok(value) })
            }),
            dispose: Arc::new(move |value| freed.lock().unwrap().push(value)),
        }));
    }
    fn ready(library: &Ref<AssetLibrary>) -> Arc<Mutex<Vec<String>>> {
        let freed = Arc::new(Mutex::new(Vec::new()));
        register_asset_loader(library, "vendor.resource", &adapter(freed.clone()));
        register_asset_descriptor(library, &descriptor("a"));
        return freed;
    }

    #[test]
    fn new_matches_the_free_constructor_and_registers_no_builtin_types() {
        let host = MockHost::new();
        host.advance(0.0);
        assert_eq!(host.now(), 0.0);
        assert_eq!(host.timer_count(), 0);
        let method = AssetLibrary::new(&context(&host));
        let free = create_asset_library(&context(&host));
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &method);
        let mut expected_ids = Vec::new();
        get_asset_ids(&mut expected_ids, &free);
        assert_eq!(actual_ids, expected_ids);
        assert!(
            method
                .read()
                .unwrap()
                .library_runtime
                .read()
                .unwrap()
                .adapters
                .is_empty()
        );
        register_asset_descriptor(&method, &descriptor("a"));
        register_asset_descriptor(&free, &descriptor("a"));
        assert_eq!(
            explain_asset_load(&method, "a"),
            explain_asset_load(&free, "a")
        );
        assert_eq!(
            explain_asset_load(&method, "a").status,
            AssetLoadStatus::MissingLoader
        );
    }
    #[test]
    fn initialize_matches_the_free_initializer_and_retains_entity_uid() {
        let host = MockHost::new();
        let method = library(&host);
        let free = library(&host);
        register_asset_descriptor(&method, &descriptor("old"));
        register_asset_descriptor(&free, &descriptor("old"));
        set_entity_uid(&mut *method.write().unwrap(), "retained".to_string());
        method.write().unwrap().initialize(&context(&host));
        initialize_asset_library(&mut free.write().unwrap(), &context(&host));
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &method, "g");
        let mut expected_ids = Vec::new();
        get_asset_group_ids(&mut expected_ids, &free, "g");
        assert_eq!(actual_ids, expected_ids);
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &method, "g");
        assert!(actual_ids.is_empty());
        assert_eq!(get_entity_uid(&mut *method.write().unwrap()), "retained");
    }
    #[test]
    fn acquire_matches_the_exact_free_in_flight_promise() {
        let host = MockHost::new();
        let method = library(&host);
        ready(&method);
        let first = method.acquire::<String>("a");
        let free = acquire_asset::<String>(&method, "a");
        assert!(first.ptr_eq(&free));
        assert_eq!(get_asset_ref_count(&method, "a"), 2);
        host.run_ready();
        assert_eq!(
            first.now_or_never().unwrap().unwrap(),
            free.now_or_never().unwrap().unwrap()
        );
    }
    #[test]
    fn are_guards_enabled_matches_the_free_per_library_identity_check() {
        let host = MockHost::new();
        let method = library(&host);
        let log = Arc::new(RwLock::new(create_log_state()));
        assert_eq!(
            method.are_guards_enabled(),
            are_asset_guards_enabled(&method)
        );
        enable_asset_guards(&method, &log);
        assert_eq!(
            method.are_guards_enabled(),
            are_asset_guards_enabled(&method)
        );
        assert!(method.are_guards_enabled());
    }
    #[test]
    fn disable_guards_matches_free_removal_of_the_installed_callback() {
        let host = MockHost::new();
        let method = library(&host);
        let free = library(&host);
        let log = Arc::new(RwLock::new(create_log_state()));
        enable_asset_guards(&method, &log);
        enable_asset_guards(&free, &log);
        method.disable_guards();
        disable_asset_guards(&free);
        assert_eq!(
            are_asset_guards_enabled(&method),
            are_asset_guards_enabled(&free)
        );
        assert!(
            method
                .read()
                .unwrap()
                .library_runtime
                .read()
                .unwrap()
                .acquire_guard
                .is_none()
        );
    }
    #[test]
    fn dispose_matches_the_free_resident_disposal_and_registry_clear() {
        let host = MockHost::new();
        let method = library(&host);
        let free = library(&host);
        let a = ready(&method);
        let b = ready(&free);
        let p = acquire_asset::<String>(&method, "a");
        let q = acquire_asset::<String>(&free, "a");
        host.run_ready();
        assert!(p.now_or_never().unwrap().is_ok());
        assert!(q.now_or_never().unwrap().is_ok());
        method.dispose();
        dispose_asset_library(&free);
        assert_eq!(*a.lock().unwrap(), *b.lock().unwrap());
        assert_eq!(*a.lock().unwrap(), ["a"]);
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &method);
        let mut expected_ids = Vec::new();
        get_asset_ids(&mut expected_ids, &free);
        assert_eq!(actual_ids, expected_ids);
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &method);
        assert!(actual_ids.is_empty());
    }
    #[test]
    fn enable_guards_matches_the_free_installation_on_each_owned_library() {
        let host = MockHost::new();
        let method = library(&host);
        let free = library(&host);
        let log = Arc::new(RwLock::new(create_log_state()));
        method.enable_guards(&log);
        enable_asset_guards(&free, &log);
        assert_eq!(
            are_asset_guards_enabled(&method),
            are_asset_guards_enabled(&free)
        );
        assert!(are_asset_guards_enabled(&method));
        let current = method
            .read()
            .unwrap()
            .library_runtime
            .read()
            .unwrap()
            .acquire_guard
            .clone();
        assert!(current.is_some());
    }
    #[test]
    fn explain_matches_the_free_loading_resident_and_freed_diagnostic() {
        let host = MockHost::new();
        let method = library(&host);
        ready(&method);
        let pending = acquire_asset::<String>(&method, "a");
        assert_eq!(method.explain("a"), explain_asset_load(&method, "a"));
        assert_eq!(method.explain("a").status, AssetLoadStatus::Loading);
        host.run_ready();
        assert!(pending.now_or_never().unwrap().is_ok());
        assert_eq!(method.explain("a").status, AssetLoadStatus::Resident);
        release_asset(&method, "a");
        assert_eq!(method.explain("a"), explain_asset_load(&method, "a"));
        assert_eq!(method.explain("a").status, AssetLoadStatus::Freed);
    }
    #[test]
    fn get_matches_the_free_actual_resident_value() {
        let host = MockHost::new();
        let method = library(&host);
        ready(&method);
        assert_eq!(method.get::<String>("a"), get_asset::<String>(&method, "a"));
        let pending = acquire_asset::<String>(&method, "a");
        host.run_ready();
        assert!(pending.now_or_never().unwrap().is_ok());
        assert_eq!(method.get::<String>("a"), get_asset::<String>(&method, "a"));
        assert_eq!(method.get::<String>("a"), Some("a".to_string()));
    }
    #[test]
    fn group_ids_matches_the_free_detached_catalog_snapshot() {
        let host = MockHost::new();
        let method = library(&host);
        ready(&method);
        let mut ids = Vec::with_capacity(8);
        ids.push("stale".to_string());
        let pointer = ids.as_ptr();
        let capacity = ids.capacity();
        method.group_ids(&mut ids, "g");
        let mut expected_ids = Vec::new();
        get_asset_group_ids(&mut expected_ids, &method, "g");
        assert_eq!(ids, expected_ids);
        assert_eq!(ids, ["a"]);
        ids.clear();
        method.group_ids(&mut ids, "g");
        assert_eq!(ids, ["a"]);
        assert_eq!(ids.as_ptr(), pointer);
        assert_eq!(ids.capacity(), capacity);
    }
    #[test]
    fn ids_matches_the_free_held_loading_and_resident_order() {
        let host = MockHost::new();
        let method = library(&host);
        ready(&method);
        let pending = acquire_asset::<String>(&method, "a");
        let mut actual_ids = Vec::with_capacity(8);
        actual_ids.push("stale".to_string());
        let pointer = actual_ids.as_ptr();
        let capacity = actual_ids.capacity();
        method.ids(&mut actual_ids);
        let mut expected_ids = Vec::new();
        get_asset_ids(&mut expected_ids, &method);
        assert_eq!(actual_ids, expected_ids);
        assert_eq!(actual_ids, ["a"]);
        host.run_ready();
        assert!(pending.now_or_never().unwrap().is_ok());
        method.ids(&mut actual_ids);
        get_asset_ids(&mut expected_ids, &method);
        assert_eq!(actual_ids, expected_ids);
        assert_eq!(actual_ids.as_ptr(), pointer);
        assert_eq!(actual_ids.capacity(), capacity);
    }
    #[test]
    fn load_group_matches_free_loader_scheduling_and_retains_group_holds() {
        let host = MockHost::new();
        let method = library(&host);
        let free = library(&host);
        ready(&method);
        ready(&free);
        let first = method.load_group("g", None);
        let second = load_asset_group(&free, "g", None);
        assert_eq!(
            get_asset_ref_count(&method, "a"),
            get_asset_ref_count(&free, "a")
        );
        host.run_ready();
        assert!(first.now_or_never().unwrap().is_ok());
        assert!(second.now_or_never().unwrap().is_ok());
        assert_eq!(
            get_asset::<String>(&method, "a"),
            get_asset::<String>(&free, "a")
        );
        assert_eq!(get_asset_ref_count(&method, "a"), 1);
    }
    #[test]
    fn ref_count_matches_the_free_number_of_unmatched_acquires() {
        let host = MockHost::new();
        let method = library(&host);
        ready(&method);
        let _ = acquire_asset::<String>(&method, "a");
        let _ = acquire_asset::<String>(&method, "a");
        assert_eq!(method.ref_count("a"), get_asset_ref_count(&method, "a"));
        assert_eq!(method.ref_count("a"), 2);
        release_asset(&method, "a");
        assert_eq!(method.ref_count("a"), get_asset_ref_count(&method, "a"));
        assert_eq!(method.ref_count("a"), 1);
    }
    #[test]
    fn register_descriptor_matches_the_free_group_catalog_registration() {
        let host = MockHost::new();
        let method = library(&host);
        let free = library(&host);
        let input = descriptor("a");
        method.register_descriptor(&input);
        register_asset_descriptor(&free, &input);
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &method, "g");
        let mut expected_ids = Vec::new();
        get_asset_group_ids(&mut expected_ids, &free, "g");
        assert_eq!(actual_ids, expected_ids);
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &method, "g");
        assert_eq!(actual_ids, ["a"]);
        input
            .write()
            .unwrap()
            .groups
            .as_mut()
            .unwrap()
            .push("later".to_string());
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &method, "later");
        assert!(actual_ids.is_empty());
    }
    #[test]
    fn register_loader_matches_the_free_actual_open_generic_adapter_identity() {
        let host = MockHost::new();
        let method = library(&host);
        let free = library(&host);
        let input = adapter(Arc::new(Mutex::new(Vec::new())));
        method.register_loader("vendor.resource", &input);
        register_asset_loader(&free, "vendor.resource", &input);
        let a = method
            .read()
            .unwrap()
            .library_runtime
            .read()
            .unwrap()
            .adapters["vendor.resource"]
            .clone()
            .unwrap();
        let b = free
            .read()
            .unwrap()
            .library_runtime
            .read()
            .unwrap()
            .adapters["vendor.resource"]
            .clone()
            .unwrap();
        assert!(Arc::ptr_eq(
            a.downcast_ref::<Ref<AssetLoaderAdapter<String>>>().unwrap(),
            &input
        ));
        assert!(Arc::ptr_eq(
            b.downcast_ref::<Ref<AssetLoaderAdapter<String>>>().unwrap(),
            &input
        ));
    }
    #[test]
    fn register_manifest_matches_the_free_batch_group_membership() {
        let host = MockHost::new();
        let method = library(&host);
        let free = library(&host);
        let manifest = vec![descriptor("a"), descriptor("b")];
        method.register_manifest(&manifest);
        register_asset_manifest(&free, &manifest);
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &method, "g");
        let mut expected_ids = Vec::new();
        get_asset_group_ids(&mut expected_ids, &free, "g");
        assert_eq!(actual_ids, expected_ids);
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &method, "g");
        assert_eq!(actual_ids, ["a", "b"]);
    }
    #[test]
    fn release_matches_the_free_last_holder_disposal() {
        let host = MockHost::new();
        let method = library(&host);
        let free = library(&host);
        let a = ready(&method);
        let b = ready(&free);
        let _ = acquire_asset::<String>(&method, "a");
        let _ = acquire_asset::<String>(&free, "a");
        host.run_ready();
        method.release("a");
        release_asset(&free, "a");
        assert_eq!(*a.lock().unwrap(), *b.lock().unwrap());
        assert_eq!(*a.lock().unwrap(), ["a"]);
        assert_eq!(
            get_asset_ref_count(&method, "a"),
            get_asset_ref_count(&free, "a")
        );
    }
    #[test]
    fn release_group_matches_the_free_release_of_each_preloaded_member() {
        let host = MockHost::new();
        let method = library(&host);
        let free = library(&host);
        let a = ready(&method);
        let b = ready(&free);
        let _ = load_asset_group(&method, "g", None);
        let _ = load_asset_group(&free, "g", None);
        host.run_ready();
        method.release_group("g");
        release_asset_group(&free, "g");
        assert_eq!(*a.lock().unwrap(), *b.lock().unwrap());
        assert_eq!(*a.lock().unwrap(), ["a"]);
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &method);
        let mut expected_ids = Vec::new();
        get_asset_ids(&mut expected_ids, &free);
        assert_eq!(actual_ids, expected_ids);
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &method);
        assert!(actual_ids.is_empty());
    }
    #[test]
    fn set_acquire_guard_matches_the_free_original_callback_identity() {
        let host = MockHost::new();
        let method = library(&host);
        let free = library(&host);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let values = seen.clone();
        let guard: AssetAcquireGuard = Arc::new(move |_, value| {
            values
                .lock()
                .unwrap()
                .push(value.read().unwrap().id.clone())
        });
        method.set_acquire_guard(Some(guard.clone()));
        set_asset_acquire_guard(&free, Some(guard.clone()));
        let a = method
            .read()
            .unwrap()
            .library_runtime
            .read()
            .unwrap()
            .acquire_guard
            .clone()
            .unwrap();
        let b = free
            .read()
            .unwrap()
            .library_runtime
            .read()
            .unwrap()
            .acquire_guard
            .clone()
            .unwrap();
        assert!(Arc::ptr_eq(&a, &b));
        let _ = acquire_asset::<String>(&method, "method");
        let _ = acquire_asset::<String>(&free, "free");
        assert_eq!(*seen.lock().unwrap(), ["method", "free"]);
    }
}

pub trait AssetLibraryMethods {
    // flight-lint: allow(contract-vocabulary) Principal137e9de4 approved native Clone+Send+Sync bounds preserve generic adapter/promise values without serialization
    fn acquire<T: Clone + Send + Sync + 'static>(
        &self,
        id: &str,
    ) -> SharedFuture<ResourceLoadResult<T>>;
    fn are_guards_enabled(&self) -> bool;
    fn disable_guards(&self) -> ();
    fn dispose(&self) -> ();
    fn enable_guards(&self, log_state: &LogStateRef) -> ();
    fn explain(&self, id: &str) -> AssetLoadExplanation;
    fn get<T: Clone + 'static>(&self, id: &str) -> Option<T>;
    fn group_ids(&self, out: &mut Vec<String>, name: &str) -> ();
    fn ids(&self, out: &mut Vec<String>) -> ();
    fn load_group(
        &self,
        name: &str,
        options: Option<&Ref<AssetGroupLoadOptions>>,
    ) -> SharedFuture<ResourceLoadResult<()>>;
    fn ref_count(&self, id: &str) -> usize;
    fn register_descriptor(&self, descriptor: &Ref<AssetDescriptor>) -> ();
    // flight-lint: allow(contract-vocabulary) Principal137e9de4 approved native Clone+Send+Sync bounds preserve generic adapter/promise values without serialization
    fn register_loader<T: Clone + Send + Sync + 'static>(
        &self,
        r#type: &str,
        adapter: &Ref<AssetLoaderAdapter<T>>,
    ) -> ();
    fn register_manifest(&self, manifest: &AssetManifest) -> ();
    fn release(&self, id: &str) -> ();
    fn release_group(&self, name: &str) -> ();
    fn set_acquire_guard(&self, guard: Option<AssetAcquireGuard>) -> ();
}

impl AssetLibrary {
    pub fn new(context: &ResourceLoaderContext) -> Ref<Self> {
        return create_asset_library(context);
    }
    pub fn initialize(&mut self, context: &ResourceLoaderContext) {
        initialize_asset_library(self, context);
    }
}

impl AssetLibraryMethods for Ref<AssetLibrary> {
    fn acquire<T: Clone + Send + Sync + 'static>(
        &self,
        id: &str,
    ) -> SharedFuture<ResourceLoadResult<T>> {
        return acquire_asset(self, id);
    }
    fn are_guards_enabled(&self) -> bool {
        return are_asset_guards_enabled(self);
    }
    fn disable_guards(&self) -> () {
        return disable_asset_guards(self);
    }
    fn dispose(&self) -> () {
        return dispose_asset_library(self);
    }
    fn enable_guards(&self, log_state: &LogStateRef) -> () {
        return enable_asset_guards(self, log_state);
    }
    fn explain(&self, id: &str) -> AssetLoadExplanation {
        return explain_asset_load(self, id);
    }
    fn get<T: Clone + 'static>(&self, id: &str) -> Option<T> {
        return get_asset(self, id);
    }
    fn group_ids(&self, out: &mut Vec<String>, name: &str) -> () {
        return get_asset_group_ids(out, self, name);
    }
    fn ids(&self, out: &mut Vec<String>) -> () {
        return get_asset_ids(out, self);
    }
    fn load_group(
        &self,
        name: &str,
        options: Option<&Ref<AssetGroupLoadOptions>>,
    ) -> SharedFuture<ResourceLoadResult<()>> {
        return load_asset_group(self, name, options);
    }
    fn ref_count(&self, id: &str) -> usize {
        return get_asset_ref_count(self, id);
    }
    fn register_descriptor(&self, descriptor: &Ref<AssetDescriptor>) -> () {
        return register_asset_descriptor(self, descriptor);
    }
    fn register_loader<T: Clone + Send + Sync + 'static>(
        &self,
        r#type: &str,
        adapter: &Ref<AssetLoaderAdapter<T>>,
    ) -> () {
        return register_asset_loader(self, r#type, adapter);
    }
    fn register_manifest(&self, manifest: &AssetManifest) -> () {
        return register_asset_manifest(self, manifest);
    }
    fn release(&self, id: &str) -> () {
        return release_asset(self, id);
    }
    fn release_group(&self, name: &str) -> () {
        return release_asset_group(self, name);
    }
    fn set_acquire_guard(&self, guard: Option<AssetAcquireGuard>) -> () {
        return set_asset_acquire_guard(self, guard);
    }
}
