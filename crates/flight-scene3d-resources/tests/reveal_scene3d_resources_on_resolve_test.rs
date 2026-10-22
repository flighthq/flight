use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_image::contract::ImageResourceReference;
use flight_materials::Material3D;
use flight_materials::contract::create_standard_pbr_material;
use flight_resource::ResourceResolutionState;
use flight_scene3d::{Mesh, Scene3D};
use flight_scene3d_resources::contract::*;
use flight_shading::contract::create_shaded_material;
use flight_signals::emit_signal;
use flight_texture::Texture;
use flight_tween::{create_tween_manager, has_tweens_of, update_tweens};

use crate::mock_host::MockHost;
use crate::support::*;

struct PendingScene {
    mesh: Ref<Mesh>,
    reference: ImageResourceReference,
    scene: Ref<Scene3D>,
    texture: Ref<Texture>,
}

fn pending_reference() -> ImageResourceReference {
    return embedded_reference(Some("image/png"));
}

fn standard_pbr(
    base_color_map: Option<&Ref<Texture>>,
    normal_map: Option<&Ref<Texture>>,
) -> Ref<dyn Material3D> {
    let mut material = create_standard_pbr_material();
    material.base_color_map = base_color_map.cloned();
    material.normal_map = normal_map.cloned();
    return Arc::new(RwLock::new(material));
}

fn shaded(diffuse_map: &Ref<Texture>) -> Ref<dyn Material3D> {
    let mut material = create_shaded_material();
    material.diffuse_map = Some(diffuse_map.clone());
    return Arc::new(RwLock::new(material));
}

fn scene_with_pending_texture() -> PendingScene {
    let reference = pending_reference();
    let texture = attach_texture(&reference);
    let mesh = mesh_of(vec![standard_pbr(Some(&texture), None)]);
    let scene = scene_with(vec![reference.clone()]);
    add_scene_mesh(&scene, &mesh);
    return PendingScene {
        mesh,
        reference,
        scene,
        texture,
    };
}

fn resolver(host: &MockHost) -> Ref<Scene3DResourceResolver> {
    return create_built_in_scene3d_resource_resolver(&host_image(), None, &context(host));
}

fn fade(seconds: f32) -> Scene3DResourceRevealOptions {
    return Scene3DResourceRevealOptions {
        fade_seconds: Some(seconds),
        ease: None,
        from: None,
    };
}

fn emit(
    resolver: &Ref<Scene3DResourceResolver>,
    resolved: bool,
    reference: &ImageResourceReference,
    texture: &Ref<Texture>,
) {
    let signals = enable_scene3d_resource_signals(resolver);
    let signal = {
        let signals = signals.read().unwrap();
        if resolved {
            signals.on_resource_resolved.clone()
        } else {
            signals.on_resource_failed.clone()
        }
    };
    emit_signal(
        &signal,
        &Scene3DResourceEvent {
            reference: reference.clone(),
            texture: texture.clone(),
        },
    );
}

fn alpha(mesh: &Ref<Mesh>) -> f32 {
    return mesh.read().unwrap().alpha;
}

mod reveal_scene3d_resources_on_resolve {
    use super::*;

    #[test]
    fn hides_every_object_carrying_a_pending_texture_to_the_start_opacity_up_front() {
        let host = MockHost::new();
        let pending = scene_with_pending_texture();
        let resolver = resolver(&host);
        reveal_scene3d_resources_on_resolve(
            &resolver,
            &pending.scene.read().unwrap(),
            &create_tween_manager(None),
            None,
        );
        assert_eq!(alpha(&pending.mesh), 0.0);
    }

    #[test]
    fn honors_a_custom_from_opacity() {
        let host = MockHost::new();
        let pending = scene_with_pending_texture();
        let resolver = resolver(&host);
        let options = Scene3DResourceRevealOptions {
            from: Some(0.2),
            ease: None,
            fade_seconds: None,
        };
        reveal_scene3d_resources_on_resolve(
            &resolver,
            &pending.scene.read().unwrap(),
            &create_tween_manager(None),
            Some(&options),
        );
        // D1 f32 bound (TS: toBeCloseTo(0.2), 0.005)
        assert!((alpha(&pending.mesh) - 0.2).abs() <= 0.005);
    }

    #[test]
    fn fades_the_owning_object_to_full_opacity_as_its_texture_resolves() {
        let host = MockHost::new();
        let pending = scene_with_pending_texture();
        let resolver = resolver(&host);
        let manager = create_tween_manager(None);
        reveal_scene3d_resources_on_resolve(
            &resolver,
            &pending.scene.read().unwrap(),
            &manager,
            Some(&fade(0.5)),
        );
        assert_eq!(alpha(&pending.mesh), 0.0);

        emit(&resolver, true, &pending.reference, &pending.texture);
        assert!(has_tweens_of(&manager, &pending.mesh));

        update_tweens(&manager, 0.5);
        // D1 f32 bound (TS: toBeCloseTo(1), 0.005)
        assert!((alpha(&pending.mesh) - 1.0).abs() <= 0.005);
    }

    #[test]
    fn waits_for_every_required_texture_across_a_material_before_revealing_its_owner() {
        let host = MockHost::new();
        let base_reference = pending_reference();
        let normal_reference = pending_reference();
        let base_color_map = attach_texture(&base_reference);
        let normal_map = attach_texture(&normal_reference);
        let mesh = mesh_of(vec![standard_pbr(Some(&base_color_map), Some(&normal_map))]);
        let scene = scene_with(vec![base_reference.clone(), normal_reference.clone()]);
        add_scene_mesh(&scene, &mesh);
        let resolver = resolver(&host);
        let manager = create_tween_manager(None);
        reveal_scene3d_resources_on_resolve(
            &resolver,
            &scene.read().unwrap(),
            &manager,
            Some(&fade(0.5)),
        );

        emit(&resolver, true, &base_reference, &base_color_map);
        assert!(!has_tweens_of(&manager, &mesh));

        emit(&resolver, true, &normal_reference, &normal_map);
        assert!(has_tweens_of(&manager, &mesh));
    }

    #[test]
    fn treats_failure_as_settled_and_reveals_the_fallback_only_after_the_remaining_resources_settle()
     {
        let host = MockHost::new();
        let base_reference = pending_reference();
        let normal_reference = pending_reference();
        let base_color_map = attach_texture(&base_reference);
        let normal_map = attach_texture(&normal_reference);
        let mesh = mesh_of(vec![standard_pbr(Some(&base_color_map), Some(&normal_map))]);
        let scene = scene_with(vec![base_reference.clone(), normal_reference.clone()]);
        add_scene_mesh(&scene, &mesh);
        let resolver = resolver(&host);
        let manager = create_tween_manager(None);
        reveal_scene3d_resources_on_resolve(
            &resolver,
            &scene.read().unwrap(),
            &manager,
            Some(&fade(0.5)),
        );

        emit(&resolver, false, &normal_reference, &normal_map);
        assert!(!has_tweens_of(&manager, &mesh));

        emit(&resolver, true, &base_reference, &base_color_map);
        assert!(has_tweens_of(&manager, &mesh));
    }

    #[test]
    fn does_not_hide_an_owner_whose_resource_was_already_bound_or_had_already_failed() {
        let host = MockHost::new();
        let bound_reference = pending_reference();
        let bound = attach_texture(&bound_reference);
        {
            let mut guard = bound.write().unwrap();
            let Texture::Texture2D(texture_2d) = &mut *guard else {
                panic!("test texture must be 2d");
            };
            texture_2d.source = Some(image_source(&fake_image()));
        }
        let failed_reference = pending_reference();
        set_reference_resolution(&failed_reference, None, ResourceResolutionState::Failed);
        let failed = attach_texture(&failed_reference);
        let mesh = mesh_of(vec![standard_pbr(Some(&bound), Some(&failed))]);
        let scene = scene_with(vec![bound_reference, failed_reference]);
        add_scene_mesh(&scene, &mesh);

        reveal_scene3d_resources_on_resolve(
            &resolver(&host),
            &scene.read().unwrap(),
            &create_tween_manager(None),
            None,
        );
        assert_eq!(alpha(&mesh), 1.0);
    }

    #[test]
    fn leaves_an_all_unlisted_mesh_unchanged_and_installs_no_fade() {
        let host = MockHost::new();
        let reference = pending_reference();
        let diffuse_map = attach_texture(&reference);
        let mesh = mesh_of(vec![shaded(&diffuse_map)]);
        mesh.write().unwrap().alpha = 0.6;
        let scene = scene_with(vec![reference.clone()]);
        add_scene_mesh(&scene, &mesh);
        let resolver = resolver(&host);
        let manager = create_tween_manager(None);

        reveal_scene3d_resources_on_resolve(
            &resolver,
            &scene.read().unwrap(),
            &manager,
            Some(&fade(0.5)),
        );
        // D1 f32 bound (TS: toBeCloseTo(0.6), 0.005)
        assert!((alpha(&mesh) - 0.6).abs() <= 0.005);

        emit(&resolver, true, &reference, &diffuse_map);
        assert!(!has_tweens_of(&manager, &mesh));
    }

    #[test]
    fn reveals_a_mixed_mesh_after_its_listed_textures_settle_without_waiting_for_an_unlisted_sibling()
     {
        let host = MockHost::new();
        let shaded_reference = pending_reference();
        let pbr_reference = pending_reference();
        let shaded_map = attach_texture(&shaded_reference);
        let pbr_map = attach_texture(&pbr_reference);
        let mesh = mesh_of(vec![
            shaded(&shaded_map),
            standard_pbr(Some(&pbr_map), None),
        ]);
        let scene = scene_with(vec![shaded_reference.clone(), pbr_reference.clone()]);
        add_scene_mesh(&scene, &mesh);
        let resolver = resolver(&host);
        let manager = create_tween_manager(None);

        reveal_scene3d_resources_on_resolve(
            &resolver,
            &scene.read().unwrap(),
            &manager,
            Some(&fade(0.5)),
        );
        assert_eq!(alpha(&mesh), 0.0);

        emit(&resolver, true, &pbr_reference, &pbr_map);
        assert!(has_tweens_of(&manager, &mesh));
        update_tweens(&manager, 0.5);
        // D1 f32 bound (TS: toBeCloseTo(1), 0.005)
        assert!((alpha(&mesh) - 1.0).abs() <= 0.005);
        assert_eq!(
            reference_state(&shaded_reference),
            ResourceResolutionState::Unresolved
        );
    }

    #[test]
    fn reveals_every_owner_of_one_shared_texture_when_that_texture_settles() {
        let host = MockHost::new();
        let reference = pending_reference();
        let texture = attach_texture(&reference);
        let a = mesh_of(vec![standard_pbr(Some(&texture), None)]);
        let b = mesh_of(vec![standard_pbr(Some(&texture), None)]);
        let scene = scene_with(vec![reference.clone()]);
        add_scene_mesh(&scene, &a);
        add_scene_mesh(&scene, &b);
        let resolver = resolver(&host);
        let manager = create_tween_manager(None);
        reveal_scene3d_resources_on_resolve(&resolver, &scene.read().unwrap(), &manager, None);

        emit(&resolver, true, &reference, &texture);
        assert!(has_tweens_of(&manager, &a));
        assert!(has_tweens_of(&manager, &b));
    }

    #[test]
    fn ignores_a_resolve_event_for_a_texture_it_is_not_tracking() {
        let host = MockHost::new();
        let pending = scene_with_pending_texture();
        let resolver = resolver(&host);
        let manager = create_tween_manager(None);
        reveal_scene3d_resources_on_resolve(
            &resolver,
            &pending.scene.read().unwrap(),
            &manager,
            Some(&fade(0.5)),
        );

        let stray_reference = pending_reference();
        let stray = attach_texture(&stray_reference);
        emit(&resolver, true, &stray_reference, &stray);
        assert!(!has_tweens_of(&manager, &stray));
        assert!(!has_tweens_of(&manager, &pending.mesh));
    }

    #[test]
    fn disconnects_the_listener_when_the_returned_disposer_runs() {
        let host = MockHost::new();
        let pending = scene_with_pending_texture();
        let resolver = resolver(&host);
        let manager = create_tween_manager(None);
        let dispose = reveal_scene3d_resources_on_resolve(
            &resolver,
            &pending.scene.read().unwrap(),
            &manager,
            Some(&fade(0.5)),
        );
        dispose();

        emit(&resolver, true, &pending.reference, &pending.texture);
        assert!(!has_tweens_of(&manager, &pending.mesh));
    }
}
