use std::sync::Arc;

use flight_clip::create_clip_region_from_rectangle;
use flight_geometry::create_rectangle;
use flight_node::contract::*;

fn clip() -> flight_entity::Ref<flight_clip::ClipRegion> {
    return create_clip_region_from_rectangle(&create_rectangle(1.0, 2.0, 3.0, 4.0));
}

mod init_clip_trait {
    use super::*;

    #[test]
    fn defaults_clip_to_null() {
        let mut target = HasClip { clip: Some(clip()) };
        init_clip_trait(&mut target, None);
        assert!(target.clip.is_none());
    }

    #[test]
    fn applies_a_clip_override_and_retains_its_identity() {
        let expected = clip();
        let mut target = HasClip { clip: None };
        let options = HasClipOptions {
            clip: Some(expected.clone()),
        };
        init_clip_trait(&mut target, Some(&options));
        assert!(Arc::ptr_eq(target.clip.as_ref().expect("clip"), &expected));
    }
}
