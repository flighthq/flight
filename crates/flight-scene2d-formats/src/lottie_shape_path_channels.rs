use std::sync::{Arc, RwLock};

use flight_animation::contract::create_animation_channel;
use serde_json::Value;

use crate::lottie_bezier_path::{flatten_lottie_shape_path, lottie_shape_path_from_json};
use crate::lottie_document::{
    create_lottie_track, has_component_specific_lottie_easing, report_lottie_drop,
};
use crate::types::{
    LottieImportContext, LottieMutableAnimationTarget, LottieRerender, LottieTangentOf,
    LottieTrackValueOf,
};

// flight-lint: allow(conform-params, contract-vocabulary) D24: shared caller-owned mutable values and callback handles replace JS mutable arrays and closures
pub fn append_lottie_shape_path_channels(
    keyframes: &[Value],
    current: &Arc<RwLock<Vec<f32>>>,
    apply: &LottieRerender,
    context: &mut LottieImportContext<'_>,
) {
    if keyframes.is_empty() {
        return;
    }
    let components = current.read().unwrap().len();
    if keyframes.iter().any(|keyframe| {
        let value = keyframe.get("s").or_else(|| keyframe.get("e"));
        let Some(value) = lottie_shape_path_from_json(value) else {
            return false;
        };
        let mut flattened = Vec::new();
        flatten_lottie_shape_path(&mut flattened, &value);
        return flattened.len() != components;
    }) {
        report_lottie_drop(
            context,
            "lottie.incompatible-animated-shape-path",
            "appendLottieShapePathChannels",
            None,
        );
        return;
    }
    let first = keyframes[0].get("s").cloned();
    let tangent_of: LottieTangentOf = Arc::new(|value, _component| value);
    if has_component_specific_lottie_easing(keyframes, components) {
        for component in 0..components {
            let first = first.clone();
            let fallback = current.clone();
            let value_of: LottieTrackValueOf = Arc::new(move |value, _index| {
                return vec![flattened_value(value.or(first.as_ref()), &fallback)[component]];
            });
            let track = create_lottie_track(
                keyframes,
                1,
                context,
                &value_of,
                component,
                false,
                &tangent_of,
            );
            let current = current.clone();
            let apply = apply.clone();
            context.channels.push(create_animation_channel(
                &track,
                Some(Arc::new(LottieMutableAnimationTarget {
                    apply: Arc::new(move |sample, _time| {
                        {
                            current.write().unwrap()[component] = sample[0];
                        }
                        apply();
                    }),
                })),
            ));
        }
        return;
    }
    let fallback = current.clone();
    let value_of: LottieTrackValueOf = Arc::new(move |value, _index| {
        return flattened_value(value.or(first.as_ref()), &fallback);
    });
    let track = create_lottie_track(
        keyframes,
        components,
        context,
        &value_of,
        0,
        false,
        &tangent_of,
    );
    let current = current.clone();
    let apply = apply.clone();
    context.channels.push(create_animation_channel(
        &track,
        Some(Arc::new(LottieMutableAnimationTarget {
            apply: Arc::new(move |sample, _time| {
                {
                    current.write().unwrap().copy_from_slice(sample);
                }
                apply();
            }),
        })),
    ));
}

fn flattened_value(value: Option<&Value>, fallback: &Arc<RwLock<Vec<f32>>>) -> Vec<f32> {
    let Some(path) = lottie_shape_path_from_json(value) else {
        return fallback.read().unwrap().clone();
    };
    let mut flattened = Vec::new();
    flatten_lottie_shape_path(&mut flattened, &path);
    return flattened;
}
