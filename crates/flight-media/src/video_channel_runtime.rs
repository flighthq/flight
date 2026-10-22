use std::sync::Arc;

use flight_host::HostImageSource;

use crate::types::*;

/// Creates the caller-owned registry that translates the source module's element-keyed WeakMaps.
// flight-lint: allow(conform-extra) D5: Rust callers explicitly own the source module's HostImageSource-keyed WeakMap state
pub fn create_video_channel_runtime_state() -> VideoChannelRuntimeStateRef {
    return Arc::new(std::sync::RwLock::new(VideoChannelRuntimeState::default()));
}

pub(crate) fn delete_video_source_runtime(
    runtime_state: &VideoChannelRuntimeStateRef,
    element: &Arc<HostImageSource>,
) {
    let mut runtime_state = runtime_state.write().unwrap();
    prune_video_source_runtimes(&mut runtime_state);
    if let Some(index) = find_video_source_runtime(&runtime_state, element) {
        runtime_state.source_runtimes.remove(index);
    }
}

pub(crate) fn find_video_source_runtime(
    runtime_state: &VideoChannelRuntimeState,
    element: &Arc<HostImageSource>,
) -> Option<usize> {
    let element = Arc::downgrade(element);
    return runtime_state
        .source_runtimes
        .iter()
        .position(|runtime| runtime.element.ptr_eq(&element));
}

pub(crate) fn get_video_source_listener(
    runtime_state: &VideoChannelRuntimeStateRef,
    element: &Arc<HostImageSource>,
) -> Option<flight_video::VideoEndedListener> {
    let mut runtime_state = runtime_state.write().unwrap();
    prune_video_source_runtimes(&mut runtime_state);
    let index = find_video_source_runtime(&runtime_state, element)?;
    return runtime_state.source_runtimes[index].on_ended.upgrade();
}

pub(crate) fn prune_video_source_runtimes(runtime_state: &mut VideoChannelRuntimeState) {
    runtime_state
        .source_runtimes
        .retain(|runtime| runtime.element.upgrade().is_some());
}

pub(crate) fn set_video_source_runtime(
    runtime_state: &VideoChannelRuntimeStateRef,
    element: &Arc<HostImageSource>,
    loops_remaining: i32,
    on_ended: flight_video::VideoEndedListener,
) {
    let mut runtime_state = runtime_state.write().unwrap();
    prune_video_source_runtimes(&mut runtime_state);
    let source_runtime = VideoSourceRuntime {
        element: Arc::downgrade(element),
        loops_remaining,
        on_ended: Arc::downgrade(&on_ended),
    };
    if let Some(index) = find_video_source_runtime(&runtime_state, element) {
        runtime_state.source_runtimes[index] = source_runtime;
    } else {
        runtime_state.source_runtimes.push(source_runtime);
    }
}
