use crate::ResourceLoadItemStatus;
use crate::resource_loader::*;
use crate::types::*;
use flight_entity::Ref;

pub trait ResourceLoaderMethods {
    fn bytes(&self) -> ResourceLoadBytes;
    fn cancel(&self);
    fn counts(&self) -> ResourceLoadCounts;
    fn dispose(&self);
    fn enable_item_signals(&self) -> Ref<ResourceLoaderItemSignals>;
    fn item_status(&self, key: &str) -> ResourceLoadItemStatus;
    fn pause(&self);
    fn progress(&self, group: Option<&str>) -> f32;
    // flight-lint: allow(contract-vocabulary) Principal batch10: native Send+Sync bounds enable canonical opaque T and SharedFuture storage; no Entity or serialized-value narrowing
    fn queue<T: Clone + Send + Sync + 'static>(
        &self,
        item: ResourceLoadInput<T>,
    ) -> Ref<ResourceLoadHandle<T>>;
    fn reset(&self);
    fn resume(&self);
    fn set_concurrency(&self, max_concurrent: f32);
    fn set_priority(&self, key: &str, priority: f32);
    fn start(&self);
}

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_host::MockHost;
    use flight_entity::allocate_entity;
    use flight_signals::connect_signal;
    use std::sync::{Arc, Mutex, RwLock};

    fn context(host: &MockHost) -> ResourceLoaderContext {
        return ResourceLoaderContext {
            spawn: host.spawn(),
            timers: host.timers(),
        };
    }
    fn loader(host: &MockHost) -> Ref<ResourceLoader> {
        return create_resource_loader(None, &context(host));
    }
    fn item(key: &str, value: i32) -> ResourceLoadInput<i32> {
        return ResourceLoadInput::Item(ResourceLoadItem {
            bytes_hint: Some(10.0),
            group: Some("g".to_string()),
            key: Some(key.to_string()),
            load: Arc::new(move |_, _| Box::pin(async move { Ok(value) })),
            on_bytes_progress: None,
            priority: None,
            retries: None,
            timeout_ms: None,
            weight: Some(1.0),
        });
    }
    fn queue_three(loader: &Ref<ResourceLoader>) {
        for i in 0..3 {
            queue_resource_load(loader, item(&i.to_string(), i));
        }
    }

    #[test]
    fn new_matches_the_free_constructor_with_option_derived_concurrency() {
        let host = MockHost::new();
        let mut settings = ResourceLoaderOptions::default();
        settings.max_concurrent = Some(1.0);
        let settings = Arc::new(RwLock::new(settings));
        let method = ResourceLoader::new(Some(&settings), &context(&host));
        let function = create_resource_loader(Some(&settings), &context(&host));
        queue_three(&method);
        queue_three(&function);
        start_resource_load(&method);
        start_resource_load(&function);
        assert_eq!(
            get_resource_load_counts(&method),
            get_resource_load_counts(&function)
        );
        assert_eq!(get_resource_load_counts(&method).in_flight_items, 1);
        host.run_ready();
        assert_eq!(get_resource_load_counts(&method).settled_items, 3);
    }
    #[test]
    fn initialize_matches_the_free_initializer_and_preserves_outer_entity_runtime() {
        let host = MockHost::new();
        let mut method: ResourceLoader = allocate_entity();
        let mut function: ResourceLoader = allocate_entity();
        flight_entity::set_entity_uid(&mut method, "retained".to_string());
        method.initialize(None, &context(&host));
        initialize_resource_loader(&mut function, None, &context(&host));
        assert_eq!(flight_entity::get_entity_uid(&mut method), "retained");
        let method = Arc::new(RwLock::new(method));
        let function = Arc::new(RwLock::new(function));
        queue_three(&method);
        queue_three(&function);
        start_resource_load(&method);
        start_resource_load(&function);
        host.run_ready();
        assert_eq!(
            get_resource_load_counts(&method),
            get_resource_load_counts(&function)
        );
        assert_eq!(get_resource_load_progress(&method, None), 1.0);
    }
    #[test]
    fn bytes_matches_the_free_accessor_for_queued_hints() {
        let host = MockHost::new();
        let loader = loader(&host);
        queue_three(&loader);
        assert_eq!(loader.bytes(), get_resource_load_bytes(&loader));
        assert_eq!(loader.bytes().bytes_total_known, 30.0);
    }
    #[test]
    fn cancel_matches_the_free_cancellation_of_queued_handles() {
        let host = MockHost::new();
        let method = loader(&host);
        let function = loader(&host);
        let a = queue_resource_load(&method, item("a", 1));
        let b = queue_resource_load(&function, item("b", 2));
        method.cancel();
        cancel_resource_load(&function);
        assert_eq!(
            get_resource_load_counts(&method),
            get_resource_load_counts(&function)
        );
        assert_eq!(
            get_resource_load_item_status(&method, "a"),
            get_resource_load_item_status(&function, "b")
        );
        assert!(futures::executor::block_on(a.read().unwrap().promise.clone()).is_err());
        assert!(futures::executor::block_on(b.read().unwrap().promise.clone()).is_err());
    }
    #[test]
    fn counts_matches_the_free_accessor_during_running_and_queued_work() {
        let host = MockHost::new();
        let loader = loader(&host);
        set_resource_loader_concurrency(&loader, 1.0);
        queue_three(&loader);
        start_resource_load(&loader);
        assert_eq!(loader.counts(), get_resource_load_counts(&loader));
        assert_eq!(
            (
                loader.counts().in_flight_items,
                loader.counts().queued_items
            ),
            (1, 2)
        );
    }
    #[test]
    fn dispose_matches_the_free_listener_clear_while_loads_still_finish() {
        let host = MockHost::new();
        let method = loader(&host);
        let function = loader(&host);
        let calls = Arc::new(Mutex::new(Vec::new()));
        for loader in [&method, &function] {
            let calls = calls.clone();
            connect_signal(
                &loader.read().unwrap().on_complete,
                Arc::new(move |_| calls.lock().unwrap().push(1)),
                None,
            );
            queue_three(loader);
        }
        method.dispose();
        dispose_resource_loader(&function);
        start_resource_load(&method);
        start_resource_load(&function);
        host.run_ready();
        assert!(calls.lock().unwrap().is_empty());
        assert_eq!(
            get_resource_load_counts(&method),
            get_resource_load_counts(&function)
        );
        assert_eq!(get_resource_load_counts(&method).settled_items, 3);
    }
    #[test]
    fn enable_item_signals_matches_the_same_free_owned_entity() {
        let host = MockHost::new();
        let loader = loader(&host);
        let method = loader.enable_item_signals();
        let function = enable_resource_loader_item_signals(&loader);
        assert!(Arc::ptr_eq(&method, &function));
        let starts = Arc::new(Mutex::new(Vec::new()));
        let captured = starts.clone();
        connect_signal(
            &method.read().unwrap().on_item_start,
            Arc::new(move |key| captured.lock().unwrap().push(key.clone())),
            None,
        );
        queue_three(&loader);
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(starts.lock().unwrap().len(), 3);
    }
    #[test]
    fn item_status_matches_the_free_pending_running_and_loaded_projection() {
        let host = MockHost::new();
        let loader = loader(&host);
        queue_resource_load(&loader, item("a", 1));
        assert_eq!(
            loader.item_status("a"),
            get_resource_load_item_status(&loader, "a")
        );
        start_resource_load(&loader);
        assert_eq!(loader.item_status("a"), ResourceLoadItemStatus::Running);
        assert_eq!(
            loader.item_status("a"),
            get_resource_load_item_status(&loader, "a")
        );
        host.run_ready();
        assert_eq!(loader.item_status("a"), ResourceLoadItemStatus::Loaded);
        assert_eq!(
            loader.item_status("a"),
            get_resource_load_item_status(&loader, "a")
        );
    }
    #[test]
    fn pause_matches_the_free_stop_before_new_dispatch() {
        let host = MockHost::new();
        let method = loader(&host);
        let function = loader(&host);
        for loader in [&method, &function] {
            set_resource_loader_concurrency(loader, 1.0);
            queue_three(loader);
            start_resource_load(loader);
        }
        method.pause();
        pause_resource_load(&function);
        host.run_ready();
        assert_eq!(
            get_resource_load_counts(&method),
            get_resource_load_counts(&function)
        );
        assert_eq!(get_resource_load_counts(&method).queued_items, 2);
    }
    #[test]
    fn progress_matches_the_free_weighted_and_group_projection_while_paused() {
        let host = MockHost::new();
        let loader = loader(&host);
        set_resource_loader_concurrency(&loader, 1.0);
        queue_three(&loader);
        start_resource_load(&loader);
        pause_resource_load(&loader);
        host.run_ready();
        assert_eq!(
            loader.progress(None),
            get_resource_load_progress(&loader, None)
        );
        assert_eq!(loader.progress(None), 1.0 / 3.0);
        assert_eq!(
            loader.progress(Some("g")),
            get_resource_load_progress(&loader, Some("g"))
        );
    }
    #[test]
    fn queue_matches_the_free_handle_and_shared_promise_identity() {
        let host = MockHost::new();
        let loader = loader(&host);
        let method = loader.queue(item("same", 42));
        let function = queue_resource_load(&loader, item("same", 99));
        assert!(Arc::ptr_eq(&method, &function));
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(
            futures::executor::block_on(method.read().unwrap().promise.clone()).unwrap(),
            42
        );
        assert_eq!(
            futures::executor::block_on(function.read().unwrap().promise.clone()).unwrap(),
            42
        );
    }
    #[test]
    fn reset_matches_the_free_reuse_of_a_previously_queued_batch() {
        let host = MockHost::new();
        let method = loader(&host);
        let function = loader(&host);
        queue_three(&method);
        queue_three(&function);
        method.reset();
        reset_resource_loader(&function);
        assert_eq!(
            get_resource_load_counts(&method),
            get_resource_load_counts(&function)
        );
        assert_eq!(get_resource_load_progress(&method, None), 0.0);
        queue_resource_load(&method, item("new", 4));
        queue_resource_load(&function, item("new", 4));
        start_resource_load(&method);
        start_resource_load(&function);
        host.run_ready();
        assert_eq!(get_resource_load_counts(&method).settled_items, 1);
        assert_eq!(
            get_resource_load_counts(&method),
            get_resource_load_counts(&function)
        );
    }
    #[test]
    fn resume_matches_the_free_restart_of_a_paused_queue() {
        let host = MockHost::new();
        let method = loader(&host);
        let function = loader(&host);
        for loader in [&method, &function] {
            set_resource_loader_concurrency(loader, 1.0);
            queue_three(loader);
            start_resource_load(loader);
            pause_resource_load(loader);
        }
        host.run_ready();
        method.resume();
        resume_resource_load(&function);
        host.run_ready();
        assert_eq!(
            get_resource_load_counts(&method),
            get_resource_load_counts(&function)
        );
        assert_eq!(get_resource_load_counts(&method).settled_items, 3);
    }
    #[test]
    fn set_concurrency_matches_the_free_immediate_dispatch_of_more_slots() {
        let host = MockHost::new();
        let method = loader(&host);
        let function = loader(&host);
        for loader in [&method, &function] {
            set_resource_loader_concurrency(loader, 1.0);
            queue_three(loader);
            start_resource_load(loader);
        }
        method.set_concurrency(2.0);
        set_resource_loader_concurrency(&function, 2.0);
        assert_eq!(
            get_resource_load_counts(&method),
            get_resource_load_counts(&function)
        );
        assert_eq!(get_resource_load_counts(&method).in_flight_items, 2);
    }
    #[test]
    fn set_priority_matches_the_free_order_change() {
        let host = MockHost::new();
        let method = loader(&host);
        let function = loader(&host);
        let order = Arc::new(Mutex::new(Vec::new()));
        for loader in [&method, &function] {
            set_resource_loader_concurrency(loader, 1.0);
            for key in ["low", "high"] {
                let order = order.clone();
                let mut entry = match item(key, 1) {
                    ResourceLoadInput::Item(entry) => entry,
                    _ => unreachable!(),
                };
                entry.load = Arc::new(move |_, _| {
                    order.lock().unwrap().push(key);
                    Box::pin(async { Ok(1) })
                });
                queue_resource_load(loader, ResourceLoadInput::Item(entry));
            }
        }
        method.set_priority("high", 10.0);
        set_resource_load_priority(&function, "high", 10.0);
        start_resource_load(&method);
        host.run_ready();
        start_resource_load(&function);
        host.run_ready();
        assert_eq!(*order.lock().unwrap(), ["high", "low", "high", "low"]);
    }
    #[test]
    fn start_matches_the_free_dispatch_and_completion_report_count() {
        let host = MockHost::new();
        let method = loader(&host);
        let function = loader(&host);
        queue_three(&method);
        queue_three(&function);
        method.start();
        start_resource_load(&function);
        assert_eq!(
            get_resource_load_counts(&method),
            get_resource_load_counts(&function)
        );
        assert_eq!(get_resource_load_counts(&method).in_flight_items, 3);
        host.advance(0.0);
        assert_eq!(host.timer_count(), 0);
        assert_eq!(host.now(), 0.0);
        assert_eq!(get_resource_load_counts(&method).settled_items, 3);
        assert_eq!(
            get_resource_load_counts(&method),
            get_resource_load_counts(&function)
        );
    }
}

impl ResourceLoader {
    pub fn new(
        options: Option<&Ref<ResourceLoaderOptions>>,
        context: &ResourceLoaderContext,
    ) -> Ref<ResourceLoader> {
        return create_resource_loader(options, context);
    }
    pub fn initialize(
        &mut self,
        options: Option<&Ref<ResourceLoaderOptions>>,
        context: &ResourceLoaderContext,
    ) {
        return initialize_resource_loader(self, options, context);
    }
}

impl ResourceLoaderMethods for Ref<ResourceLoader> {
    fn bytes(&self) -> ResourceLoadBytes {
        return get_resource_load_bytes(self);
    }
    fn cancel(&self) {
        return cancel_resource_load(self);
    }
    fn counts(&self) -> ResourceLoadCounts {
        return get_resource_load_counts(self);
    }
    fn dispose(&self) {
        return dispose_resource_loader(self);
    }
    fn enable_item_signals(&self) -> Ref<ResourceLoaderItemSignals> {
        return enable_resource_loader_item_signals(self);
    }
    fn item_status(&self, key: &str) -> ResourceLoadItemStatus {
        return get_resource_load_item_status(self, key);
    }
    fn pause(&self) {
        return pause_resource_load(self);
    }
    fn progress(&self, group: Option<&str>) -> f32 {
        return get_resource_load_progress(self, group);
    }
    fn queue<T: Clone + Send + Sync + 'static>(
        &self,
        item: ResourceLoadInput<T>,
    ) -> Ref<ResourceLoadHandle<T>> {
        return queue_resource_load(self, item);
    }
    fn reset(&self) {
        return reset_resource_loader(self);
    }
    fn resume(&self) {
        return resume_resource_load(self);
    }
    fn set_concurrency(&self, max_concurrent: f32) {
        return set_resource_loader_concurrency(self, max_concurrent);
    }
    fn set_priority(&self, key: &str, priority: f32) {
        return set_resource_load_priority(self, key, priority);
    }
    fn start(&self) {
        return start_resource_load(self);
    }
}
