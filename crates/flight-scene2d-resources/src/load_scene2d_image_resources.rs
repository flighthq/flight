use std::panic::{AssertUnwindSafe, resume_unwind};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use flight_image::{
    ImageResolverState, ImageResourceFetch, ImageResourceReference,
    resolve_image_resource_reference,
};
use flight_image_codec::HostImageDecodeCapabilities;
use flight_signals::emit_signal;
use flight_stream::create_abort_controller;
use flight_texture::{TextureSourceRef, set_texture_source};
use futures::FutureExt;
use futures::future::join_all;

use crate::scene2d_resource_diagnostics::report_scene2d_resource_failure;
use crate::types::*;

fn bind_scene2d_image_resource_textures(
    reference: &ImageResourceReference,
    source: &TextureSourceRef,
) {
    let textures = match reference {
        ImageResourceReference::Embedded(value) => value.reference.read().unwrap().textures.clone(),
        ImageResourceReference::External(value) => value.reference.read().unwrap().textures.clone(),
    };
    for texture in textures {
        set_texture_source(&mut *texture.write().unwrap(), Some(source.clone()));
    }
}

// flight-lint: allow(conform-params) D5 caller-owned image resolver and failure guard state replace module hooks
pub async fn load_scene2d_image_resources(
    image_decode: &HostImageDecodeCapabilities,
    document: &flight_entity::Ref<Scene2DDocument>,
    options: Option<&LoadScene2DImageResourcesOptions>,
    resolver_state: &ImageResolverState,
    guard_state: &Scene2DResourceFailureGuardStateRef,
) -> Scene2DImageResources {
    let references = document.read().unwrap().image_resources.clone();
    let selected: Vec<_> = references
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
    let reject_external: ImageResourceFetch = Arc::new(|_, _| Box::pin(async { None }));
    let fetch = options
        .and_then(|options| options.fetch.as_ref())
        .unwrap_or(&reject_external);
    let decode = options.and_then(|options| options.decode.as_ref());
    let progress = options.and_then(|options| options.progress.clone());
    let loaded = Arc::new(AtomicUsize::new(0));
    let total = selected.len();
    let futures = selected.iter().cloned().map(|reference| {
        let loaded = loaded.clone();
        let progress = progress.clone();
        let signal = signal.clone();
        async move {
            let result = AssertUnwindSafe(resolve_image_resource_reference(
                image_decode,
                &reference,
                fetch,
                &signal,
                decode,
                resolver_state,
            ))
            .catch_unwind()
            .await;
            let count = loaded.fetch_add(1, Ordering::SeqCst) + 1;
            if let Some(progress) = &progress {
                emit_signal(
                    progress,
                    &Scene2DImageResourceLoadProgress {
                        loaded: count,
                        reference,
                        total,
                    },
                );
            }
            return result;
        }
    });
    let sources = join_all(futures).await;
    let mut resolved = Vec::new();
    let mut unresolved = Vec::new();
    for (reference, source) in selected.into_iter().zip(sources) {
        let source = match source {
            Ok(source) => source,
            Err(payload) => resume_unwind(payload),
        };
        if let Some(source) = source {
            bind_scene2d_image_resource_textures(&reference, &source);
            resolved.push(reference);
        } else {
            unresolved.push(reference);
        }
    }
    if !unresolved.is_empty() {
        report_scene2d_resource_failure(
            guard_state,
            &Scene2DResourceFailureNotice {
                operation: Scene2DResourceFailureOperation::LoadScene2DImageResources,
                reason: Scene2DResourceFailureReason::ImageResourcesUnresolved,
                total,
                unresolved: unresolved.len(),
                url: None,
            },
        );
    }
    return Scene2DImageResources {
        document: document.clone(),
        resolved,
        unresolved,
    };
}
