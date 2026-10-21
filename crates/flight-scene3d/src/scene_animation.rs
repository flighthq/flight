use crate::{Node3DRef, Scene3DAnimationPath};
use flight_animation::AnimationClip;
use flight_animation::contract::sample_animation_track_ref;
use flight_geometry::{set_quaternion, set_vector3};
use flight_node::{NodeRef, invalidate_node_local_transform};

#[derive(Clone)]
pub struct Scene3DAnimationTarget {
    pub node: Node3DRef,
    pub path: Scene3DAnimationPath,
}

pub fn apply_animation_clip_to_scene3d(clip: &AnimationClip, time: f32) {
    let mut scratch = [0.0; 4];
    for channel in &clip.channels {
        let Some(target) = channel
            .target_ref
            .as_ref()
            .and_then(|t| t.downcast_ref::<Scene3DAnimationTarget>())
        else {
            continue;
        };
        if target.path == Scene3DAnimationPath::Weights {
            let morph = target
                .node
                .read()
                .unwrap()
                .as_mesh()
                .and_then(|m| m.morph.clone());
            if let Some(morph) = morph {
                let mut sampled = morph.read().unwrap().weights.to_vec();
                sample_animation_track_ref(&mut sampled, &channel.track, time);
                let mut morph = morph.write().unwrap();
                for (out, value) in morph.weights.iter_mut().zip(sampled) {
                    *out = value;
                }
            }
            continue;
        }
        sample_animation_track_ref(&mut scratch, &channel.track, time);
        {
            let mut n = target.node.write().unwrap();
            let f = n.node3d_fields_mut();
            match target.path {
                Scene3DAnimationPath::Translation => {
                    set_vector3(&mut f.position, scratch[0], scratch[1], scratch[2])
                }
                Scene3DAnimationPath::Scale => {
                    set_vector3(&mut f.scale, scratch[0], scratch[1], scratch[2])
                }
                _ => set_quaternion(
                    &mut f.rotation,
                    scratch[0],
                    scratch[1],
                    scratch[2],
                    scratch[3],
                ),
            }
        }
        let node: NodeRef = target.node.clone();
        invalidate_node_local_transform(&node);
    }
}
