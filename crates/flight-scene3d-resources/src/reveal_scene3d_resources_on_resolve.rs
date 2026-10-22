use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_materials::Material;
use flight_node::{NodeRef, for_each_node_descendant};
use flight_resource::ResourceResolutionState;
use flight_scene3d::{Node3D, Node3DRef, Scene3D, as_node3d_ref};
use flight_signals::{connect_signal, disconnect_signal};
use flight_texture::{Texture, has_texture_source};
use flight_tween::{TweenManager, TweenOptions, create_tween, tween_with};

use crate::get_scene3d_resource_textures::{
    get_scene3d_texture_resource_reference, get_texture_identity,
};
use crate::resolve_scene3d_resources::get_image_resource_reference_state;
use crate::scene_material_texture_registry::get_scene3d_material_textures;
use crate::scene_resource_signals::enable_scene3d_resource_signals;
use crate::types::*;

/// One owning node waiting for its pending listed textures.
struct Scene3DResourceRevealOwner {
    node: Node3DRef,
    pending: Vec<Ref<Texture>>,
}

/// Owners in discovery order, plus each pending texture's owners by identity.
#[derive(Default)]
struct Scene3DResourceRevealState {
    owners: Vec<Ref<Scene3DResourceRevealOwner>>,
    owners_by_texture: HashMap<usize, Vec<Ref<Scene3DResourceRevealOwner>>>,
}

// Maps each unresolved or loading texture to its owning mesh's reveal state. Already bound images and
// previously failed references are settled before the recipe begins, so they never hide an owner
// waiting for an event that will not arrive. Repeated texture slots on one owner count once.
fn collect_pending_texture_owners(
    scene: &Scene3D,
    registry: &Scene3DMaterialTextureRegistry,
    reveal: &mut Scene3DResourceRevealState,
) {
    let mut owners_by_node: HashMap<usize, Ref<Scene3DResourceRevealOwner>> = HashMap::new();
    let mut visit = |node: &Node3DRef| {
        let materials = {
            let node = node.read().unwrap();
            let Some(mesh) = node.as_mesh() else {
                return;
            };
            mesh.materials.read().unwrap().clone()
        };
        let mut slots = Vec::new();
        for material in materials.into_iter().flatten() {
            slots.clear();
            {
                let material = material.read().unwrap();
                let material: &dyn Material = &*material;
                get_scene3d_material_textures(registry, material, &mut slots);
            }
            for texture in &slots {
                let Some(reference) = get_scene3d_texture_resource_reference(scene, texture) else {
                    continue;
                };
                if has_texture_source(&*texture.read().unwrap())
                    || get_image_resource_reference_state(&reference)
                        == ResourceResolutionState::Failed
                {
                    continue;
                }
                let owner = owners_by_node
                    .entry(Arc::as_ptr(node) as *const () as usize)
                    .or_insert_with(|| {
                        let owner = Arc::new(RwLock::new(Scene3DResourceRevealOwner {
                            node: node.clone(),
                            pending: Vec::new(),
                        }));
                        reveal.owners.push(owner.clone());
                        owner
                    })
                    .clone();
                {
                    let mut owner = owner.write().unwrap();
                    if owner
                        .pending
                        .iter()
                        .any(|pending| Arc::ptr_eq(pending, texture))
                    {
                        continue;
                    }
                    owner.pending.push(texture.clone());
                }
                reveal
                    .owners_by_texture
                    .entry(get_texture_identity(texture))
                    .or_default()
                    .push(owner);
            }
        }
    };
    visit(&scene.root);
    let root: NodeRef = scene.root.clone();
    for_each_node_descendant(&root, &mut |node| {
        if let Some(node) = as_node3d_ref(node) {
            visit(&node);
        }
    });
}

/// The standard streamed-texture fade-in: every mesh carrying a still-pending listed texture is
/// hidden to `from` up front, and once every such texture settles its alpha tweens to 1 over
/// `fade_seconds`. Failure counts as settled; a cancelled load stays pending until re-requested.
/// Call before loading so objects start hidden. Returns a disposer that disconnects the listener;
/// the tween manager and any in-flight tweens are the caller's.
pub fn reveal_scene3d_resources_on_resolve(
    resolver: &Ref<Scene3DResourceResolver>,
    scene: &Scene3D,
    tween_manager: &TweenManager,
    options: Option<&Scene3DResourceRevealOptions>,
) -> Arc<dyn Fn() + Send + Sync> {
    let fade_seconds = options
        .and_then(|options| options.fade_seconds)
        .unwrap_or(0.4);
    let from = options.and_then(|options| options.from).unwrap_or(0.0);
    let tween_options = options
        .and_then(|options| options.ease)
        .map(|ease| TweenOptions {
            ease: Some(ease),
            ..TweenOptions::default()
        });

    let registry = resolver.read().unwrap().registry.clone();
    let reveal = Arc::new(RwLock::new(Scene3DResourceRevealState::default()));
    collect_pending_texture_owners(scene, &registry, &mut reveal.write().unwrap());
    for owner in &reveal.read().unwrap().owners {
        let node = owner.read().unwrap().node.clone();
        node.write().unwrap().node3d_fields_mut().alpha = from;
    }

    let signals = enable_scene3d_resource_signals(resolver);
    let manager = tween_manager.clone();
    let slot = Arc::new(move |event: &Scene3DResourceEvent| {
        // A resource emits at most one terminal event for a texture; removing here also makes the
        // recipe robust to a caller replaying or forwarding the same event.
        let Some(texture_owners) = reveal
            .write()
            .unwrap()
            .owners_by_texture
            .remove(&get_texture_identity(&event.texture))
        else {
            return;
        };
        for owner in texture_owners {
            let settled = {
                let mut owner = owner.write().unwrap();
                owner
                    .pending
                    .retain(|texture| !Arc::ptr_eq(texture, &event.texture));
                owner.pending.is_empty().then(|| owner.node.clone())
            };
            if let Some(node) = settled {
                create_tween(
                    &manager,
                    &node,
                    fade_seconds,
                    &[tween_with::<dyn Node3D>(
                        |node| &mut node.node3d_fields_mut().alpha,
                        "alpha",
                        1.0,
                    )],
                    tween_options.as_ref(),
                );
            }
        }
    });
    let (failed, resolved) = {
        let signals = signals.read().unwrap();
        (
            signals.on_resource_failed.clone(),
            signals.on_resource_resolved.clone(),
        )
    };
    let resolved_slot = connect_signal(&resolved, slot.clone(), None);
    let failed_slot = connect_signal(&failed, slot, None);
    return Arc::new(move || {
        disconnect_signal(&resolved, resolved_slot);
        disconnect_signal(&failed, failed_slot);
    });
}
