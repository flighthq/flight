use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogLevel, LogStateRef, LogValue, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_texture::TextureSourceRef;
use flight_textureatlas::contract::*;

use crate::texture_atlas_fixture::*;

fn guard_state() -> TextureAtlasGuardState {
    let make: fn() -> TextureAtlasGuardState = TextureAtlasGuardState::default;
    return make();
}

fn logs() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

mod are_texture_atlas_guards_enabled {
    use super::*;

    #[test]
    fn reports_the_current_guard_state() {
        let mut state = guard_state();
        assert!(!are_texture_atlas_guards_enabled(&state));
        enable_texture_atlas_guards(&mut state, &logs(), Arc::new(|| 0.0));
        assert!(are_texture_atlas_guards_enabled(&state));
    }
}

mod disable_texture_atlas_guards {
    use super::*;

    #[test]
    fn removes_an_enabled_guard() {
        let mut state = guard_state();
        enable_texture_atlas_guards(&mut state, &logs(), Arc::new(|| 0.0));
        disable_texture_atlas_guards(&mut state);
        assert!(!are_texture_atlas_guards_enabled(&state));
        assert!(state.guard.is_none());
    }
}

mod enable_texture_atlas_guards {
    use super::*;

    fn rotated_atlas() -> flight_entity::Ref<TextureAtlas> {
        let mut options = common();
        options.uv_rotation = Some(0.25);
        let atlas = create_test_texture_atlas_ref(Some(TextureAtlasOptions {
            texture: Some(page(Some(image(100, 50) as TextureSourceRef), options)),
            ..atlas_options()
        }));
        add_texture_atlas_region(
            &mut atlas.write().unwrap(),
            0.0,
            0.0,
            10.0,
            10.0,
            None,
            None,
            None,
        );
        return atlas;
    }

    #[test]
    fn warns_once_when_a_rotated_page_cannot_mint_a_region_texture() {
        let atlas = rotated_atlas();
        let log_state = logs();
        let sink = create_memory_log_sink(8);
        add_log_sink(&log_state, sink.sink.clone());
        let mut state = guard_state();
        enable_texture_atlas_guards(&mut state, &log_state, Arc::new(|| 42.0));
        assert!(get_texture_atlas_region_texture(&atlas, 0, Some(&state)).is_none());
        assert!(get_texture_atlas_region_texture(&atlas, 0, Some(&state)).is_none());
        let entries = {
            let mut collected = Vec::new();
            get_memory_log_sink_entries(&mut collected, &sink);
            collected
        };
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].channel.as_deref(), Some("textureatlas"));
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].timestamp_ms, 42.0);
        let LogData::Record(record) = &entries[0].data else {
            panic!("a record");
        };
        let Some(LogValue::Str(message)) = record.get("message") else {
            panic!("a message");
        };
        let Some(LogValue::Object(retained)) = record.get("atlas") else {
            panic!("an atlas object");
        };
        let retained = Arc::downcast::<RwLock<TextureAtlas>>(retained.clone()).unwrap();
        assert!(Arc::ptr_eq(&retained, &atlas));
        assert_eq!(record.len(), 4);
        assert!(message.contains("uvRotation"));
        assert!(matches!(record.get("regionId"), Some(LogValue::Int(0))));
        assert!(
            matches!(record.get("status"), Some(LogValue::Str(status)) if status == "rotated-page")
        );
    }

    #[test]
    fn stays_silent_for_the_other_refusals() {
        let log_state = logs();
        let sink = create_memory_log_sink(8);
        add_log_sink(&log_state, sink.sink.clone());
        let mut state = guard_state();
        enable_texture_atlas_guards(&mut state, &log_state, Arc::new(|| 0.0));
        let atlas = create_texture_atlas();
        assert!(get_texture_atlas_region_texture(&atlas, 0, Some(&state)).is_none());
        add_texture_atlas_region(
            &mut atlas.write().unwrap(),
            0.0,
            0.0,
            10.0,
            10.0,
            None,
            None,
            None,
        );
        assert!(get_texture_atlas_region_texture(&atlas, 0, Some(&state)).is_none());
        assert!(
            {
                let mut collected = Vec::new();
                get_memory_log_sink_entries(&mut collected, &sink);
                collected
            }
            .is_empty()
        );
    }
}
