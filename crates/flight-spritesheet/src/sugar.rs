//! D18 Rust conveniences: each method delegates to one public free function.

use flight_entity::Ref;
use flight_textureatlas::TextureAtlas;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, RwLock};

    use flight_entity::{Ref, set_record_value};
    use flight_textureatlas::{
        TextureAtlas, TextureAtlasRegionOptions, create_texture_atlas, create_texture_atlas_region,
    };

    use crate::contract::*;

    fn atlas() -> Ref<TextureAtlas> {
        let mut atlas = create_texture_atlas(None);
        for (id, name) in [(0, "walk_0"), (1, "walk_1")] {
            let options = TextureAtlasRegionOptions {
                id: Some(id),
                name: Some(name.to_string()),
                ..TextureAtlasRegionOptions::default()
            };
            atlas
                .regions
                .push(create_texture_atlas_region(Some(&options)));
        }
        return Arc::new(RwLock::new(atlas));
    }

    fn sheet() -> Spritesheet {
        let mut sheet = create_spritesheet(Some(SpritesheetOptions {
            atlas: Some(atlas()),
            ..SpritesheetOptions::default()
        }));
        for id in [0, 1, 7] {
            sheet
                .frames
                .push(create_spritesheet_frame(Some(&SpritesheetFrameOptions {
                    id: Some(id),
                    ..SpritesheetFrameOptions::default()
                })));
        }
        set_record_value(
            &mut sheet.animations,
            "walk".to_string(),
            playing_animation(),
        );
        return sheet;
    }

    fn playing_animation() -> Ref<SpritesheetAnimation> {
        return create_spritesheet_animation(Some(&SpritesheetAnimationOptions {
            frames: Some(vec![0.0, 1.0, 2.0, 5.0]),
            frame_duration: Some(100.0),
            repeat_count: Some(-1),
            ..SpritesheetAnimationOptions::default()
        }));
    }

    fn data() -> SpritesheetData {
        let frame = create_spritesheet_frame_data(Some(SpritesheetFrameDataOptions {
            name: Some("walk_1".to_string()),
            ..SpritesheetFrameDataOptions::default()
        }));
        let animation = create_spritesheet_animation_data(Some(SpritesheetAnimationDataOptions {
            name: Some("walk".to_string()),
            frame_names: Some(vec!["walk_1".to_string(), "nope".to_string()]),
            ..SpritesheetAnimationDataOptions::default()
        }));
        return create_spritesheet_data(Some(SpritesheetDataOptions {
            animations: Some(vec![animation]),
            frames: Some(vec![frame]),
            ..SpritesheetDataOptions::default()
        }));
    }

    fn playing() -> Ref<SpritesheetPlayer> {
        let player = create_spritesheet_player(None);
        play_spritesheet_animation(
            &mut player.write().unwrap(),
            Some(&playing_animation()),
            None,
        );
        update_spritesheet_player(&mut player.write().unwrap(), 150.0);
        return player;
    }

    fn show<T: std::fmt::Debug>(value: &T) -> String {
        return format!("{:?}", value);
    }

    fn pool() -> SpritesheetPlayerPool {
        let make: fn() -> SpritesheetPlayerPool = SpritesheetPlayerPool::default;
        return make();
    }

    #[test]
    fn spritesheet_initialize_spritesheet_matches_initialize_spritesheet() {
        let (mut a, mut b) = (sheet(), sheet());
        a.initialize_spritesheet(None);
        initialize_spritesheet(&mut b, None);
        assert_eq!(show(&a), show(&b));
    }

    #[test]
    fn spritesheet_clone_spritesheet_matches_clone_spritesheet() {
        let s = sheet();
        assert_eq!(show(&s.clone_spritesheet()), show(&clone_spritesheet(&s)));
    }

    #[test]
    fn spritesheet_create_spritesheet_animation_from_frame_names_matches_create_spritesheet_animation_from_frame_names()
     {
        let s = sheet();
        let pattern = SpritesheetFramePattern::Name(SpritesheetFramePatternName {
            value: "walk_".to_string(),
        });
        assert_eq!(
            show(&s.create_spritesheet_animation_from_frame_names(&pattern, None)),
            show(&create_spritesheet_animation_from_frame_names(
                &s, &pattern, None
            ))
        );
    }

    #[test]
    fn spritesheet_get_spritesheet_animation_matches_get_spritesheet_animation() {
        let s = sheet();
        assert!(Arc::ptr_eq(
            &s.get_spritesheet_animation("walk").unwrap(),
            &get_spritesheet_animation(&s, "walk").unwrap()
        ));
    }

    #[test]
    fn spritesheet_validate_spritesheet_matches_validate_spritesheet() {
        let s = sheet();
        assert_eq!(s.validate_spritesheet(), validate_spritesheet(&s));
        assert!(s.validate_spritesheet().is_some());
    }

    #[test]
    fn spritesheetanimation_initialize_spritesheet_animation_matches_initialize_spritesheet_animation()
     {
        let (a, b) = (playing_animation(), playing_animation());
        a.write().unwrap().initialize_spritesheet_animation(None);
        initialize_spritesheet_animation(&mut b.write().unwrap(), None);
        assert_eq!(show(&*a.read().unwrap()), show(&*b.read().unwrap()));
    }

    #[test]
    fn spritesheetanimationdata_initialize_spritesheet_animation_data_matches_initialize_spritesheet_animation_data()
     {
        let (mut a, mut b) = (data().animations[0].clone(), data().animations[0].clone());
        a.initialize_spritesheet_animation_data(None);
        initialize_spritesheet_animation_data(&mut b, None);
        assert_eq!(a, b);
    }

    #[test]
    fn spritesheetdata_initialize_spritesheet_data_matches_initialize_spritesheet_data() {
        let (mut a, mut b) = (data(), data());
        a.initialize_spritesheet_data(None);
        initialize_spritesheet_data(&mut b, None);
        assert_eq!(a, b);
    }

    #[test]
    fn spritesheetdata_create_spritesheet_from_data_matches_create_spritesheet_from_data() {
        let (s, shared) = (data(), atlas());
        assert_eq!(
            show(&s.create_spritesheet_from_data(&shared)),
            show(&create_spritesheet_from_data(&s, &shared))
        );
    }

    #[test]
    fn spritesheetdata_validate_spritesheet_data_matches_validate_spritesheet_data() {
        let s = data();
        assert_eq!(s.validate_spritesheet_data(), validate_spritesheet_data(&s));
        assert!(s.validate_spritesheet_data().is_some());
    }

    #[test]
    fn spritesheetframedata_initialize_spritesheet_frame_data_matches_initialize_spritesheet_frame_data()
     {
        let (mut a, mut b) = (data().frames[0].clone(), data().frames[0].clone());
        a.initialize_spritesheet_frame_data(None);
        initialize_spritesheet_frame_data(&mut b, None);
        assert_eq!(a, b);
    }

    #[test]
    fn spritesheetframe_initialize_spritesheet_frame_matches_initialize_spritesheet_frame() {
        let (a, b) = (sheet().frames[2].clone(), sheet().frames[2].clone());
        a.write().unwrap().initialize_spritesheet_frame(None);
        initialize_spritesheet_frame(&mut b.write().unwrap(), None);
        assert_eq!(*a.read().unwrap(), *b.read().unwrap());
    }

    #[test]
    fn spritesheetplayer_initialize_spritesheet_player_matches_initialize_spritesheet_player() {
        let (a, b) = (playing(), playing());
        a.write().unwrap().initialize_spritesheet_player(None);
        initialize_spritesheet_player(&mut b.write().unwrap(), None);
        assert_eq!(show(&*a.read().unwrap()), show(&*b.read().unwrap()));
    }

    #[test]
    fn spritesheetplayer_clone_spritesheet_player_matches_clone_spritesheet_player() {
        let s = playing();
        let s = s.read().unwrap();
        assert_eq!(
            show(&*s.clone_spritesheet_player().read().unwrap()),
            show(&*clone_spritesheet_player(&s).read().unwrap())
        );
    }

    #[test]
    fn spritesheetplayer_dispose_spritesheet_player_matches_dispose_spritesheet_player() {
        let (a, b) = (playing(), playing());
        a.write().unwrap().dispose_spritesheet_player();
        dispose_spritesheet_player(&mut b.write().unwrap());
        assert_eq!(show(&*a.read().unwrap()), show(&*b.read().unwrap()));
    }

    #[test]
    fn spritesheetplayer_get_spritesheet_player_frame_matches_get_spritesheet_player_frame() {
        let (s, sheet) = (playing(), sheet());
        let s = s.read().unwrap();
        assert!(Arc::ptr_eq(
            &s.get_spritesheet_player_frame(&sheet).unwrap(),
            &get_spritesheet_player_frame(&s, &sheet).unwrap()
        ));
    }

    #[test]
    fn spritesheetplayer_get_spritesheet_player_frame_at_matches_get_spritesheet_player_frame_at() {
        let (s, sheet) = (playing(), sheet());
        let s = s.read().unwrap();
        assert!(Arc::ptr_eq(
            &s.get_spritesheet_player_frame_at(&sheet, 1.0).unwrap(),
            &get_spritesheet_player_frame_at(&s, &sheet, 1.0).unwrap()
        ));
    }

    #[test]
    fn spritesheetplayer_pause_spritesheet_player_matches_pause_spritesheet_player() {
        let (a, b) = (playing(), playing());
        a.write().unwrap().pause_spritesheet_player();
        pause_spritesheet_player(&mut b.write().unwrap());
        assert_eq!(show(&*a.read().unwrap()), show(&*b.read().unwrap()));
    }

    #[test]
    fn spritesheetplayer_play_spritesheet_animation_matches_play_spritesheet_animation() {
        let (a, b, animation) = (playing(), playing(), playing_animation());
        a.write()
            .unwrap()
            .play_spritesheet_animation(Some(&animation), Some(false));
        play_spritesheet_animation(&mut b.write().unwrap(), Some(&animation), Some(false));
        assert_eq!(show(&*a.read().unwrap()), show(&*b.read().unwrap()));
    }

    #[test]
    fn spritesheetplayer_queue_spritesheet_animation_matches_queue_spritesheet_animation() {
        let (a, b, animation) = (playing(), playing(), playing_animation());
        a.write().unwrap().queue_spritesheet_animation(&animation);
        queue_spritesheet_animation(&mut b.write().unwrap(), &animation);
        assert!(Arc::ptr_eq(
            &a.read().unwrap().queue[0],
            &b.read().unwrap().queue[0]
        ));
    }

    #[test]
    fn spritesheetplayer_resume_spritesheet_player_matches_resume_spritesheet_player() {
        let (a, b) = (playing(), playing());
        pause_spritesheet_player(&mut a.write().unwrap());
        pause_spritesheet_player(&mut b.write().unwrap());
        a.write().unwrap().resume_spritesheet_player();
        resume_spritesheet_player(&mut b.write().unwrap());
        assert_eq!(show(&*a.read().unwrap()), show(&*b.read().unwrap()));
    }

    #[test]
    fn spritesheetplayer_seek_spritesheet_player_to_frame_matches_seek_spritesheet_player_to_frame()
    {
        let (a, b) = (playing(), playing());
        a.write().unwrap().seek_spritesheet_player_to_frame(2.0);
        seek_spritesheet_player_to_frame(&mut b.write().unwrap(), 2.0);
        assert_eq!(show(&*a.read().unwrap()), show(&*b.read().unwrap()));
    }

    #[test]
    fn spritesheetplayer_seek_spritesheet_player_to_time_matches_seek_spritesheet_player_to_time() {
        let (a, b) = (playing(), playing());
        a.write().unwrap().seek_spritesheet_player_to_time(250.0);
        seek_spritesheet_player_to_time(&mut b.write().unwrap(), 250.0);
        assert_eq!(show(&*a.read().unwrap()), show(&*b.read().unwrap()));
    }

    #[test]
    fn spritesheetplayer_stop_spritesheet_player_matches_stop_spritesheet_player() {
        let (a, b) = (playing(), playing());
        a.write().unwrap().stop_spritesheet_player();
        stop_spritesheet_player(&mut b.write().unwrap());
        assert_eq!(show(&*a.read().unwrap()), show(&*b.read().unwrap()));
    }

    #[test]
    fn spritesheetplayer_update_spritesheet_player_matches_update_spritesheet_player() {
        let (a, b) = (playing(), playing());
        assert_eq!(
            a.write().unwrap().update_spritesheet_player(120.0),
            update_spritesheet_player(&mut b.write().unwrap(), 120.0)
        );
        assert_eq!(show(&*a.read().unwrap()), show(&*b.read().unwrap()));
    }

    #[test]
    fn spritesheetplayerpool_acquire_spritesheet_player_matches_acquire_spritesheet_player() {
        let (mut a, mut b) = (pool(), pool());
        assert_eq!(
            show(&*a.acquire_spritesheet_player().read().unwrap()),
            show(&*acquire_spritesheet_player(&mut b).read().unwrap())
        );
    }

    #[test]
    fn spritesheetplayerpool_release_spritesheet_player_matches_release_spritesheet_player() {
        let (mut a, mut b) = (pool(), pool());
        let (pa, pb) = (playing(), playing());
        a.release_spritesheet_player(&pa);
        release_spritesheet_player(&mut b, &pb);
        assert!(Arc::ptr_eq(&acquire_spritesheet_player(&mut a), &pa));
        assert!(Arc::ptr_eq(&acquire_spritesheet_player(&mut b), &pb));
    }
}

impl Spritesheet {
    pub fn create_spritesheet_animation_from_frame_names(
        &self,
        pattern: &SpritesheetFramePattern,
        options: Option<&SpritesheetAnimationFrameNameOptions>,
    ) -> Option<Ref<SpritesheetAnimation>> {
        return create_spritesheet_animation_from_frame_names(self, pattern, options);
    }

    pub fn initialize_spritesheet(&mut self, obj: Option<SpritesheetOptions>) {
        initialize_spritesheet(self, obj);
    }

    pub fn clone_spritesheet(&self) -> Spritesheet {
        return clone_spritesheet(self);
    }

    pub fn get_spritesheet_animation(&self, label: &str) -> Option<Ref<SpritesheetAnimation>> {
        return get_spritesheet_animation(self, label);
    }

    pub fn validate_spritesheet(&self) -> Option<Vec<SpritesheetValidationDiagnostic>> {
        return validate_spritesheet(self);
    }
}

impl SpritesheetFrame {
    pub fn initialize_spritesheet_frame(&mut self, obj: Option<&SpritesheetFrameOptions>) {
        initialize_spritesheet_frame(self, obj);
    }
}

impl SpritesheetAnimation {
    pub fn initialize_spritesheet_animation(&mut self, obj: Option<&SpritesheetAnimationOptions>) {
        initialize_spritesheet_animation(self, obj);
    }
}

impl SpritesheetData {
    pub fn create_spritesheet_from_data(&self, atlas: &Ref<TextureAtlas>) -> Spritesheet {
        return create_spritesheet_from_data(self, atlas);
    }

    pub fn initialize_spritesheet_data(&mut self, obj: Option<SpritesheetDataOptions>) {
        initialize_spritesheet_data(self, obj);
    }

    pub fn validate_spritesheet_data(&self) -> Option<Vec<SpritesheetValidationDiagnostic>> {
        return validate_spritesheet_data(self);
    }
}

impl SpritesheetFrameData {
    pub fn initialize_spritesheet_frame_data(&mut self, obj: Option<SpritesheetFrameDataOptions>) {
        initialize_spritesheet_frame_data(self, obj);
    }
}

impl SpritesheetAnimationData {
    pub fn initialize_spritesheet_animation_data(
        &mut self,
        obj: Option<SpritesheetAnimationDataOptions>,
    ) {
        initialize_spritesheet_animation_data(self, obj);
    }
}

impl SpritesheetPlayer {
    // flight-lint: allow(f64) D1: elapsed time, speed and the display index are JS numbers
    pub fn initialize_spritesheet_player(&mut self, obj: Option<SpritesheetPlayerOptions>) {
        initialize_spritesheet_player(self, obj);
    }

    pub fn clone_spritesheet_player(&self) -> Ref<SpritesheetPlayer> {
        return clone_spritesheet_player(self);
    }

    pub fn dispose_spritesheet_player(&mut self) {
        dispose_spritesheet_player(self);
    }

    pub fn get_spritesheet_player_frame(
        &self,
        spritesheet: &Spritesheet,
    ) -> Option<Ref<SpritesheetFrame>> {
        return get_spritesheet_player_frame(self, spritesheet);
    }

    // flight-lint: allow(f64) D1: the offset joins the JS-number display index
    pub fn get_spritesheet_player_frame_at(
        &self,
        spritesheet: &Spritesheet,
        frame_offset: f64,
    ) -> Option<Ref<SpritesheetFrame>> {
        return get_spritesheet_player_frame_at(self, spritesheet, frame_offset);
    }

    pub fn pause_spritesheet_player(&mut self) {
        pause_spritesheet_player(self);
    }

    pub fn play_spritesheet_animation(
        &mut self,
        animation: Option<&Ref<SpritesheetAnimation>>,
        restart: Option<bool>,
    ) {
        play_spritesheet_animation(self, animation, restart);
    }

    pub fn queue_spritesheet_animation(&mut self, animation: &Ref<SpritesheetAnimation>) {
        queue_spritesheet_animation(self, animation);
    }

    pub fn resume_spritesheet_player(&mut self) {
        resume_spritesheet_player(self);
    }

    // flight-lint: allow(f64) D1: the display index is a JS number
    pub fn seek_spritesheet_player_to_frame(&mut self, frame_index: f64) {
        seek_spritesheet_player_to_frame(self, frame_index);
    }

    // flight-lint: allow(f64) D1: elapsed time is a JS number
    pub fn seek_spritesheet_player_to_time(&mut self, time: f64) {
        seek_spritesheet_player_to_time(self, time);
    }

    pub fn stop_spritesheet_player(&mut self) {
        stop_spritesheet_player(self);
    }

    // flight-lint: allow(f64) D1: frame time is a JS number of milliseconds
    pub fn update_spritesheet_player(&mut self, delta_time: f64) -> bool {
        return update_spritesheet_player(self, delta_time);
    }
}

impl SpritesheetPlayerPool {
    pub fn acquire_spritesheet_player(&mut self) -> Ref<SpritesheetPlayer> {
        return acquire_spritesheet_player(self);
    }

    pub fn release_spritesheet_player(&mut self, player: &Ref<SpritesheetPlayer>) {
        release_spritesheet_player(self, player);
    }
}
