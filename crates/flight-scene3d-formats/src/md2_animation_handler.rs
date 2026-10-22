use crate::md2_schema::MD2_FRAME_FPS;
use crate::md2_types::{Md2Frame, Md2SectionHandler};
use crate::stl_features::is_stl_whitespace;
use flight_animation::{AnimationInterpolation, create_animation_track};
use flight_entity::Ref;
use flight_meshgeometry::MeshMorph;
use flight_scene3d::{
    Scene3DAnimationPath, Scene3DDocumentAnimation, Scene3DDocumentAnimationChannel,
};
use std::sync::{Arc, LazyLock, RwLock};

pub static MD2_ANIMATION_HANDLER: LazyLock<Ref<Md2SectionHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Md2SectionHandler {
        feature: "Animation".to_string(),
        collect: Arc::new(|context| {
            context
                .document
                .animations
                .extend(build_md2_morph_animations(
                    context.frames,
                    context.morph.as_ref(),
                ));
        }),
    }))
});
pub static MD2_ANIMATION_FAMILY: LazyLock<Vec<Ref<Md2SectionHandler>>> =
    LazyLock::new(|| vec![MD2_ANIMATION_HANDLER.clone()]);

fn build_md2_action_clip(
    action: &str,
    start_frame: usize,
    end_frame: usize,
    target_count: usize,
    used_names: &mut Vec<String>,
) -> Scene3DDocumentAnimation {
    let count = end_frame - start_frame + 1;
    let mut times = vec![0.0; count];
    let mut values = vec![0.0; count * target_count];
    for i in 0..count {
        let frame = start_frame + i;
        times[i] = i as f32 / MD2_FRAME_FPS;
        if frame >= 1 {
            values[i * target_count + frame - 1] = 1.0;
        }
    }
    let duration = times[count - 1];
    let mut track = create_animation_track();
    track.components = target_count;
    track.interpolation = AnimationInterpolation::Linear;
    track.times = times;
    track.values = values;
    return Scene3DDocumentAnimation {
        channels: vec![Scene3DDocumentAnimationChannel {
            node: 0,
            path: Scene3DAnimationPath::Weights,
            track: Arc::new(RwLock::new(track)),
        }],
        duration,
        name: Some(unique_md2_clip_name(action, used_names)),
    };
}

fn build_md2_morph_animations(
    frames: &[Md2Frame],
    morph: Option<&Ref<MeshMorph>>,
) -> Vec<Scene3DDocumentAnimation> {
    let Some(morph) = morph else {
        return Vec::new();
    };
    let target_count = morph.read().unwrap().targets.len();
    if target_count == 0 {
        return Vec::new();
    }
    let mut animations = Vec::new();
    let mut used_names = Vec::new();
    let mut run_start = 0;
    for k in 1..=frames.len() {
        let run_action = md2_frame_action_name(&frames[run_start].name);
        if k < frames.len() && md2_frame_action_name(&frames[k].name) == run_action {
            continue;
        }
        animations.push(build_md2_action_clip(
            run_action,
            run_start,
            k - 1,
            target_count,
            &mut used_names,
        ));
        run_start = k;
    }
    return animations;
}

fn md2_frame_action_name(frame_name: &str) -> &str {
    return frame_name
        .trim_matches(is_stl_whitespace)
        .trim_end_matches(|c: char| c.is_ascii_digit());
}

fn unique_md2_clip_name(action: &str, used_names: &mut Vec<String>) -> String {
    let base = if action.is_empty() { "default" } else { action };
    let mut name = base.to_string();
    let mut n = 2;
    while used_names.contains(&name) {
        name = format!("{base}.{n}");
        n += 1;
    }
    used_names.push(name.clone());
    return name;
}
