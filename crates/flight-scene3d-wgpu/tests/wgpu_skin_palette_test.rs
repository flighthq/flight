use flight_render_wgpu::*;
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

// A shared palette handle (TS: a skeleton's Float32Array), whose identity keys its arena region.
fn make_palette(length: usize) -> flight_entity::Ref<Box<flight_entity::Float32Array>> {
    return std::sync::Arc::new(std::sync::RwLock::new(
        vec![0.0_f32; length].into_boxed_slice(),
    ));
}

mod destroy_wgpu_skin_palette {
    use super::*;

    #[test]
    fn clears_every_palette_and_draw_group_cache_slot() {
        let mut test = make_wgpu_scene3d_state(None);
        let palette = make_palette(16);
        ensure_wgpu_skin_draw_bind_group(&mut test.state, &palette);
        assert!(
            get_wgpu_scene3d_runtime(&mut test.state)
                .skin_draw_bind_group
                .is_some()
        );

        destroy_wgpu_skin_palette(&mut test.state);

        let runtime = get_wgpu_scene3d_runtime(&mut test.state);
        assert!(runtime.skin_palette_texture.is_none());
        assert!(runtime.skin_palette_view.is_none());
        assert_eq!(runtime.skin_palette_arena_rows, 0);
        assert_eq!(runtime.skin_palette_arena_cursor, 0);
        assert!(runtime.skin_palette_arena_bases.is_none());
        assert!(runtime.skin_draw_bind_group.is_none());
    }
}

mod ensure_wgpu_skin_draw_bind_group {
    use super::*;

    #[test]
    fn caches_the_group_and_rebuilds_it_only_when_palette_growth_replaces_its_view() {
        let mut test = make_wgpu_scene3d_state(None);
        let palette = make_palette(16);
        let first = ensure_wgpu_skin_draw_bind_group(&mut test.state, &palette);
        let group_count = test.count("createBindGroup");
        // The same skeleton keeps its region, so nothing is reallocated and nothing is rebuilt.
        assert_eq!(
            ensure_wgpu_skin_draw_bind_group(&mut test.state, &palette),
            first
        );
        assert_eq!(test.count("createBindGroup"), group_count);

        // A second skeleton claims the next row, which outgrows the arena and replaces its view.
        let second = make_palette(16);
        ensure_wgpu_skin_draw_bind_group(&mut test.state, &second);
        assert_eq!(test.count("createBindGroup"), group_count + 1);
        assert_eq!(test.count("createTexture"), 2);
    }
}

mod ensure_wgpu_skin_draw_layout {
    use super::*;

    #[test]
    fn caches_the_state_owned_skin_draw_layout() {
        let mut test = make_wgpu_scene3d_state(None);
        let layout = ensure_wgpu_skin_draw_layout(&mut test.state);
        assert_eq!(ensure_wgpu_skin_draw_layout(&mut test.state), layout);
        assert_eq!(test.count("createBindGroupLayout"), 1);
    }
}

mod ensure_wgpu_skin_mesh_draw_bind_group {
    use super::*;

    #[test]
    fn binds_both_palettes_so_no_binding_its_layout_declares_is_left_unsupplied() {
        let mut test = make_wgpu_scene3d_state(None);
        let joints = make_palette(16 * 2);
        let normals = make_palette(12 * 2);
        ensure_wgpu_skin_mesh_draw_bind_group(&mut test.state, &joints, &normals);
        let group = test.bind_groups().last().cloned().unwrap();
        let bindings: Vec<u32> = group.entries.iter().map(|entry| entry.binding).collect();
        assert_eq!(bindings, vec![0, 1, 2]);
    }
}

mod ensure_wgpu_skin_mesh_draw_layout {
    use super::*;

    // The two layouts are deliberately different: the shadow path skins positions only.
    #[test]
    fn declares_the_normal_palette_at_binding_2_which_the_shadow_layout_does_not() {
        let mut test = make_wgpu_scene3d_state(None);
        ensure_wgpu_skin_mesh_draw_layout(&mut test.state);
        let mesh_layout = test.bind_group_layouts().last().cloned().unwrap();
        let mesh_bindings: Vec<u32> = mesh_layout
            .entries
            .iter()
            .map(|entry| entry.binding)
            .collect();
        assert_eq!(mesh_bindings, vec![0, 1, 2]);

        ensure_wgpu_skin_draw_layout(&mut test.state);
        let shadow_layout = test.bind_group_layouts().last().cloned().unwrap();
        let shadow_bindings: Vec<u32> = shadow_layout
            .entries
            .iter()
            .map(|entry| entry.binding)
            .collect();
        assert_eq!(shadow_bindings, vec![0, 1]);
    }

    #[test]
    fn caches_its_own_layout_rather_than_rebuilding_it_per_draw() {
        let mut test = make_wgpu_scene3d_state(None);
        let mesh = ensure_wgpu_skin_mesh_draw_layout(&mut test.state);
        ensure_wgpu_skin_mesh_draw_layout(&mut test.state);
        assert_eq!(test.count("createBindGroupLayout"), 1);
        // Real layouts carry identity, so the mesh and shadow layouts are observably distinct too.
        assert_ne!(ensure_wgpu_skin_draw_layout(&mut test.state), mesh);
    }
}

mod register_wgpu_gpu_skinning {
    use super::*;

    #[test]
    fn installs_the_opt_in_adapter_on_only_the_requested_render_state() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut other = make_wgpu_scene3d_state(None);
        assert!(
            get_wgpu_scene3d_runtime(&mut test.state)
                .skinning_adapter
                .is_none()
        );
        register_wgpu_gpu_skinning(&mut test.state);
        assert!(
            get_wgpu_scene3d_runtime(&mut test.state)
                .skinning_adapter
                .is_some_and(|adapter| std::ptr::eq(adapter, &WGPU_SKINNING_ADAPTER))
        );
        assert!(
            get_wgpu_render_state_runtime(&test.state)
                .registries
                .gpu_skinning
                .is_some_and(|adapter| std::ptr::eq(adapter, &WGPU_SKINNING_ADAPTER))
        );
        assert!(
            get_wgpu_scene3d_runtime(&mut other.state)
                .skinning_adapter
                .is_none()
        );
    }
}

mod upload_wgpu_skin_normal_palette {
    use super::*;

    // The joint count comes from /12, not /16: two joints are 6 texels.
    #[test]
    fn packs_three_texels_per_joint_not_four() {
        let mut test = make_wgpu_scene3d_state(None);
        let normals = make_palette(12 * 2);
        let base = upload_wgpu_skin_normal_palette(&mut test.state, &normals);
        let texture = test.textures()[0].clone();
        let write = test.texture_writes()[0].clone();

        assert_eq!(base, 0);
        assert_eq!(texture.format, wgpu::TextureFormat::Rgba32Float);
        assert_eq!(texture.size, [256, 1, 1]);
        assert_eq!(write.size, [6, 1, 1]);
    }

    #[test]
    fn uses_a_texture_distinct_from_the_pose_palette() {
        let mut test = make_wgpu_scene3d_state(None);
        let joints = make_palette(16);
        let normals = make_palette(12);
        upload_wgpu_skin_palette(&mut test.state, &joints);
        upload_wgpu_skin_normal_palette(&mut test.state, &normals);
        let runtime = get_wgpu_scene3d_runtime(&mut test.state);
        assert_ne!(
            runtime.skin_normal_palette_texture,
            runtime.skin_palette_texture
        );
    }
}

mod upload_wgpu_skin_palette {
    use super::*;

    #[test]
    fn packs_four_rgba32float_texels_per_joint_into_a_fixed_width_arena_row() {
        let mut test = make_wgpu_scene3d_state(None);
        let joints = make_palette(32);
        let base = upload_wgpu_skin_palette(&mut test.state, &joints);
        let texture = test.textures()[0].clone();
        let write = test.texture_writes()[0].clone();

        assert_eq!(base, 0);
        assert_eq!(texture.format, wgpu::TextureFormat::Rgba32Float);
        assert_eq!(texture.size, [256, 1, 1]);
        assert_eq!(write.bytes_per_row, Some(128));
        assert_eq!(write.size, [8, 1, 1]);
    }

    // A second skeleton must not land on the first one's texels.
    #[test]
    fn gives_two_skeletons_in_one_frame_distinct_regions() {
        let mut test = make_wgpu_scene3d_state(None);
        let first_joints = make_palette(16 * 2);
        let second_joints = make_palette(16 * 2);
        let first = upload_wgpu_skin_palette(&mut test.state, &first_joints);
        let second = upload_wgpu_skin_palette(&mut test.state, &second_joints);

        assert_ne!(second, first);
        assert_eq!(second, 256);
    }

    #[test]
    fn gives_one_skeleton_one_region_however_many_passes_ask_for_it() {
        let mut test = make_wgpu_scene3d_state(None);
        let palette = make_palette(16 * 2);
        let shadow_pass = upload_wgpu_skin_palette(&mut test.state, &palette);
        let writes = test.count("writeTexture");
        let mesh_pass = upload_wgpu_skin_palette(&mut test.state, &palette);

        assert_eq!(mesh_pass, shadow_pass);
        assert_eq!(test.count("writeTexture"), writes);
    }

    // 100 joints is 400 texels against a 256-texel row: one full row and 144 left over.
    // Ruling 5: the arena keys a region by the palette handle and holds that handle for the frame,
    // so the address cannot be reused by another palette before the bases reset.
    #[test]
    fn holds_each_keyed_palette_handle_until_the_arena_resets() {
        let mut test = make_wgpu_scene3d_state(None);
        let palette = make_palette(16 * 2);
        upload_wgpu_skin_palette(&mut test.state, &palette);
        assert_eq!(std::sync::Arc::strong_count(&palette), 3);
        destroy_wgpu_skin_palette(&mut test.state);
        assert_eq!(std::sync::Arc::strong_count(&palette), 1);
    }

    #[test]
    fn spans_rows_for_a_skeleton_wider_than_one_row_as_whole_rows_plus_the_remainder() {
        let mut test = make_wgpu_scene3d_state(None);
        let joints = make_palette(16 * 100);
        upload_wgpu_skin_palette(&mut test.state, &joints);
        let writes = test.texture_writes();

        assert_eq!(writes.len(), 2);
        assert_eq!(writes[0].bytes_per_row, Some(4096));
        assert_eq!(writes[0].rows_per_image, Some(1));
        assert_eq!(writes[0].size, [256, 1, 1]);
        assert_eq!(writes[1].origin, [0, 1, 0]);
        assert_eq!(writes[1].bytes_per_row, Some(2304));
        // The source writes the remainder through a layout offset of 4096 bytes into the palette;
        // the native write passes exactly those trailing bytes.
        assert_eq!(writes[1].data.len(), 2304);
        assert_eq!(writes[1].size, [144, 1, 1]);
    }

    // 400 texels rounds up to two whole rows, so the next skeleton starts at 512 rather than 400.
    #[test]
    fn starts_the_next_region_on_a_row_boundary_so_every_write_stays_a_rectangle() {
        let mut test = make_wgpu_scene3d_state(None);
        let first = make_palette(16 * 100);
        let second = make_palette(16 * 2);
        upload_wgpu_skin_palette(&mut test.state, &first);
        assert_eq!(upload_wgpu_skin_palette(&mut test.state, &second), 512);
    }

    // Growth is a new texture; without the replay the first skeleton's texels would be blank in it.
    #[test]
    fn replays_regions_already_handed_out_when_growth_replaces_the_arena_texture() {
        let mut test = make_wgpu_scene3d_state(None);
        let first = make_palette(16 * 2);
        let second = make_palette(16 * 2);
        upload_wgpu_skin_palette(&mut test.state, &first);
        let before = test.count("writeTexture");

        upload_wgpu_skin_palette(&mut test.state, &second);
        assert_eq!(test.count("createTexture"), 2);
        let writes = test.texture_writes();
        assert_eq!(writes.len(), before + 2);
        assert_eq!(writes[writes.len() - 2].origin, [0, 0, 0]);
        assert_eq!(writes[writes.len() - 1].origin, [0, 1, 0]);
    }
}
