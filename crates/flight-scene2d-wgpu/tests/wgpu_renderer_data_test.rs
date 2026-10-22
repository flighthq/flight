use std::sync::Arc;

use flight_node::RendererData;
use flight_scene2d_wgpu::*;

fn create_rich_text_scratch(alloc_w: f32) -> WgpuRichTextData {
    let mut out: WgpuRichTextData = flight_entity::allocate_entity();
    out.alloc_w = alloc_w;
    return out;
}

mod create_wgpu_renderer_data {
    use super::*;

    #[test]
    fn erases_the_scratch_into_a_renderer_data_handle() {
        let data = create_wgpu_renderer_data(create_rich_text_scratch(1.0));
        let data = data.read().unwrap();
        assert!(data.as_any().is::<WgpuRichTextData>());
    }

    #[test]
    fn round_trips_through_get_wgpu_renderer_data() {
        let data = create_wgpu_renderer_data(create_rich_text_scratch(42.0));
        let data = data.read().unwrap();
        let recovered = get_wgpu_renderer_data::<WgpuRichTextData>(Some(&*data));
        assert_eq!(recovered.map(|value| value.alloc_w), Some(42.0));
    }
}

mod get_wgpu_renderer_data {
    use super::*;

    #[test]
    fn returns_none_when_data_is_none() {
        assert!(get_wgpu_renderer_data::<WgpuRichTextData>(None).is_none());
    }

    #[test]
    fn returns_the_original_record() {
        let data = create_wgpu_renderer_data(create_rich_text_scratch(7.0));
        let data = data.read().unwrap();
        let recovered = get_wgpu_renderer_data::<WgpuRichTextData>(Some(&*data)).unwrap();
        assert!(std::ptr::eq(
            recovered as *const WgpuRichTextData as *const u8,
            &*data as *const dyn RendererData as *const u8
        ));
    }

    #[test]
    fn returns_none_for_another_scratch_kind() {
        let data = create_wgpu_renderer_data(create_rich_text_scratch(7.0));
        let data = data.read().unwrap();
        assert!(get_wgpu_renderer_data::<WgpuTextLabelData>(Some(&*data)).is_none());
    }
}

mod get_wgpu_renderer_data_mut {
    use super::*;

    #[test]
    fn writes_through_to_the_erased_record() {
        let data = create_wgpu_renderer_data(create_rich_text_scratch(1.0));
        {
            let mut guard = data.write().unwrap();
            let scratch: Option<&mut WgpuRichTextData> =
                get_wgpu_renderer_data_mut(Some(&mut *guard));
            scratch.unwrap().alloc_w = 9.0;
        }
        let guard = data.read().unwrap();
        assert_eq!(
            get_wgpu_renderer_data::<WgpuRichTextData>(Some(&*guard)).map(|value| value.alloc_w),
            Some(9.0)
        );
        assert_eq!(Arc::strong_count(&data), 1);
    }
}

mod initialize_wgpu_renderer_data {
    use super::*;

    #[test]
    fn writes_the_record_and_keeps_the_receiver_entity_identity() {
        let mut out = create_rich_text_scratch(1.0);
        let id = flight_entity::get_entity_id(&out);
        initialize_wgpu_renderer_data(&mut out, create_rich_text_scratch(5.0));
        assert_eq!(out.alloc_w, 5.0);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}
