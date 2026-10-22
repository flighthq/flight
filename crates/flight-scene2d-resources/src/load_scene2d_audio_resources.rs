use std::panic::{AssertUnwindSafe, resume_unwind};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use flight_audio::{
    AudioResourceFetch, HostAudioDecodeCapabilities, resolve_audio_resource_reference,
};
use flight_signals::emit_signal;
use flight_stream::create_abort_controller;
use futures::FutureExt;
use futures::future::join_all;

use crate::scene2d_resource_diagnostics::report_scene2d_resource_failure;
use crate::types::*;

// flight-lint: allow(conform-params) D5 caller-owned guard state replaces the source module hook
pub async fn load_scene2d_audio_resources(
    document: &flight_entity::Ref<Scene2DDocument>,
    options: Option<&LoadScene2DAudioResourcesOptions>,
    guard_state: &Scene2DResourceFailureGuardStateRef,
) -> Scene2DAudioResources {
    let selected: Vec<_> = document
        .read()
        .unwrap()
        .audio_resources
        .iter()
        .filter(|reference| {
            options
                .and_then(|options| options.select.as_ref())
                .map(|select| select(reference))
                .unwrap_or(true)
        })
        .cloned()
        .collect();
    let default_signal = create_abort_controller().signal;
    let signal = options
        .and_then(|options| options.signal.clone())
        .unwrap_or(default_signal);
    let empty_audio_decode = HostAudioDecodeCapabilities::default();
    let audio_decode = options
        .and_then(|options| options.audio_decode.as_ref())
        .unwrap_or(&empty_audio_decode);
    let reject_external: AudioResourceFetch = Arc::new(|_, _| Box::pin(async { None }));
    let fetch = options
        .and_then(|options| options.fetch.as_ref())
        .unwrap_or(&reject_external);
    let decoders = options.and_then(|options| options.decoders.as_ref());
    let progress = options.and_then(|options| options.progress.clone());
    let loaded = Arc::new(AtomicUsize::new(0));
    let total = selected.len();
    let futures = selected.iter().cloned().map(|reference| {
        let loaded = loaded.clone();
        let progress = progress.clone();
        let signal = signal.clone();
        async move {
            let result = AssertUnwindSafe(resolve_audio_resource_reference(
                &reference,
                audio_decode,
                fetch,
                &signal,
                decoders,
            ))
            .catch_unwind()
            .await;
            let count = loaded.fetch_add(1, Ordering::SeqCst) + 1;
            if let Some(progress) = &progress {
                emit_signal(
                    progress,
                    &Scene2DAudioResourceLoadProgress {
                        loaded: count,
                        reference,
                        total,
                    },
                );
            }
            return result;
        }
    });
    let resources = join_all(futures).await;
    let mut resolved = Vec::new();
    let mut unresolved = Vec::new();
    for (reference, resource) in selected.into_iter().zip(resources) {
        let resource = match resource {
            Ok(resource) => resource,
            Err(payload) => resume_unwind(payload),
        };
        if resource.is_some() {
            resolved.push(reference);
        } else {
            unresolved.push(reference);
        }
    }
    if !unresolved.is_empty() {
        report_scene2d_resource_failure(
            guard_state,
            &Scene2DResourceFailureNotice {
                operation: Scene2DResourceFailureOperation::LoadScene2DAudioResources,
                reason: Scene2DResourceFailureReason::AudioResourcesUnresolved,
                total,
                unresolved: unresolved.len(),
                url: None,
            },
        );
    }
    return Scene2DAudioResources {
        document: document.clone(),
        resolved,
        unresolved,
    };
}
