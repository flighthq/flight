//! D18 Rust conveniences: each method delegates to one public free function.

use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Ref;
use flight_geometry::{Rectangle, Vector2};
use flight_log::LogStateRef;
use flight_texture::Texture2D;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, RwLock};

    use flight_geometry::{create_rectangle, create_vector2};
    use flight_log::create_log_state;

    use crate::contract::*;

    fn atlas() -> TextureAtlas {
        let mut atlas = create_texture_atlas(None);
        add_texture_atlas_region(&mut atlas, 0.0, 0.0, 10.0, 10.0, None, None, Some("walk_2"));
        add_texture_atlas_region(
            &mut atlas,
            10.0,
            0.0,
            10.0,
            10.0,
            None,
            None,
            Some("walk_1"),
        );
        return atlas;
    }

    fn region() -> TextureAtlasRegion {
        let options = TextureAtlasRegionOptions {
            height: Some(20.0),
            name: Some("walk_07".to_string()),
            rotation: Some(TextureAtlasRotation::Clockwise90),
            source_x: Some(2.0),
            width: Some(30.0),
            x: Some(5.0),
            y: Some(6.0),
            ..TextureAtlasRegionOptions::default()
        };
        return create_texture_atlas_region(Some(&options))
            .read()
            .unwrap()
            .clone();
    }

    fn guards() -> TextureAtlasGuardState {
        let make: fn() -> TextureAtlasGuardState = TextureAtlasGuardState::default;
        return make();
    }

    fn grid() -> GridSliceOptions {
        let make: fn() -> GridSliceOptions = GridSliceOptions::default;
        let mut options = make();
        options.columns = 2;
        options.rows = 2;
        options.image_width = 16.0;
        options.image_height = 16.0;
        return options;
    }

    fn shown<T: std::fmt::Debug>(value: &T) -> String {
        return format!("{:?}", value);
    }

    fn region_names(atlas: &TextureAtlas) -> Vec<(i32, Option<String>, f32, f32, f32, f32)> {
        return atlas
            .regions
            .iter()
            .map(|region| {
                let region = region.read().unwrap();
                (
                    region.id,
                    region.name.clone(),
                    region.x,
                    region.y,
                    region.width,
                    region.height,
                )
            })
            .collect();
    }

    #[test]
    fn textureatlas_add_texture_atlas_region_matches_add_texture_atlas_region() {
        let (mut a, mut b) = (atlas(), atlas());
        a.add_texture_atlas_region(1.0, 2.0, 3.0, 4.0, Some(0.5), None, Some("x"));
        add_texture_atlas_region(&mut b, 1.0, 2.0, 3.0, 4.0, Some(0.5), None, Some("x"));
        assert_eq!(region_names(&a), region_names(&b));
    }

    #[test]
    fn textureatlas_add_texture_atlas_region_corners_matches_add_texture_atlas_region_corners() {
        let (mut a, mut b) = (atlas(), atlas());
        a.add_texture_atlas_region_corners(1.0, 2.0, 5.0, 9.0, None, None, None);
        add_texture_atlas_region_corners(&mut b, 1.0, 2.0, 5.0, 9.0, None, None, None);
        assert_eq!(region_names(&a), region_names(&b));
    }

    #[test]
    fn textureatlas_add_texture_atlas_region_rectangle_matches_add_texture_atlas_region_rectangle()
    {
        let (mut a, mut b) = (atlas(), atlas());
        let rect = create_rectangle(1.0, 2.0, 3.0, 4.0);
        let pivot = create_vector2(1.0, 1.0);
        a.add_texture_atlas_region_rectangle(&rect, Some(&pivot), Some("r"));
        add_texture_atlas_region_rectangle(&mut b, &rect, Some(&pivot), Some("r"));
        assert_eq!(region_names(&a), region_names(&b));
        assert_eq!(shown(&a.regions[2]), shown(&b.regions[2]));
    }

    #[test]
    fn textureatlas_add_texture_atlas_region_vector2_matches_add_texture_atlas_region_vector2() {
        let (mut a, mut b) = (atlas(), atlas());
        let (start, end) = (create_vector2(1.0, 2.0), create_vector2(4.0, 8.0));
        a.add_texture_atlas_region_vector2(&start, &end, None, None);
        add_texture_atlas_region_vector2(&mut b, &start, &end, None, None);
        assert_eq!(region_names(&a), region_names(&b));
    }

    #[test]
    fn textureatlas_build_texture_atlas_region_index_matches_build_texture_atlas_region_index() {
        let s = atlas();
        let (a, b) = (
            s.build_texture_atlas_region_index(),
            build_texture_atlas_region_index(&s),
        );
        let mut keys: Vec<&String> = a.keys().collect();
        keys.sort();
        assert_eq!(keys.len(), b.len());
        for key in keys {
            assert!(Arc::ptr_eq(&a[key], &b[key]));
        }
    }

    #[test]
    fn textureatlas_clear_texture_atlas_regions_matches_clear_texture_atlas_regions() {
        let (mut a, mut b) = (atlas(), atlas());
        a.clear_texture_atlas_regions();
        clear_texture_atlas_regions(&mut b);
        assert_eq!(shown(&a), shown(&b));
    }

    #[test]
    fn textureatlas_dispose_texture_atlas_matches_dispose_texture_atlas() {
        let (mut a, mut b) = (atlas(), atlas());
        a.dispose_texture_atlas();
        dispose_texture_atlas(&mut b);
        assert_eq!(shown(&a), shown(&b));
    }

    #[test]
    fn textureatlas_explain_texture_atlas_region_texture_matches_explain_texture_atlas_region_texture()
     {
        let s = atlas();
        assert_eq!(
            s.explain_texture_atlas_region_texture(0),
            explain_texture_atlas_region_texture(&s, 0)
        );
    }

    #[test]
    fn textureatlas_get_texture_atlas_byte_size_matches_get_texture_atlas_byte_size() {
        let s = atlas();
        assert_eq!(
            s.get_texture_atlas_byte_size(),
            get_texture_atlas_byte_size(&s)
        );
    }

    #[test]
    fn textureatlas_get_texture_atlas_region_by_id_matches_get_texture_atlas_region_by_id() {
        let s = atlas();
        assert!(Arc::ptr_eq(
            &s.get_texture_atlas_region_by_id(1).unwrap(),
            &get_texture_atlas_region_by_id(&s, 1).unwrap()
        ));
    }

    #[test]
    fn textureatlas_get_texture_atlas_region_by_name_matches_get_texture_atlas_region_by_name() {
        let s = atlas();
        assert!(Arc::ptr_eq(
            &s.get_texture_atlas_region_by_name("walk_1").unwrap(),
            &get_texture_atlas_region_by_name(&s, "walk_1").unwrap()
        ));
    }

    #[test]
    fn textureatlas_get_texture_atlas_region_by_ordinal_matches_get_texture_atlas_region_by_ordinal()
     {
        let s = atlas();
        assert!(Arc::ptr_eq(
            &s.get_texture_atlas_region_by_ordinal("walk", 2.0).unwrap(),
            &get_texture_atlas_region_by_ordinal(&s, "walk", 2.0).unwrap()
        ));
    }

    #[test]
    fn textureatlas_get_texture_atlas_region_count_matches_get_texture_atlas_region_count() {
        let s = atlas();
        assert_eq!(
            s.get_texture_atlas_region_count(),
            get_texture_atlas_region_count(&s)
        );
    }

    #[test]
    fn textureatlas_get_texture_atlas_region_sequence_matches_get_texture_atlas_region_sequence() {
        let s = atlas();
        let (mut a, mut b) = (Vec::new(), Vec::new());
        s.get_texture_atlas_region_sequence(&mut a, "walk");
        get_texture_atlas_region_sequence(&mut b, &s, "walk");
        assert_eq!(a.len(), b.len());
        assert!(a.iter().zip(&b).all(|(x, y)| Arc::ptr_eq(x, y)));
    }

    #[test]
    fn textureatlas_get_texture_atlas_region_texture_matches_get_texture_atlas_region_texture() {
        let s = atlas();
        assert_eq!(
            s.get_texture_atlas_region_texture(0, None).is_none(),
            get_texture_atlas_region_texture(&s, 0, None).is_none()
        );
    }

    #[test]
    fn textureatlas_has_texture_atlas_region_matches_has_texture_atlas_region() {
        let s = atlas();
        assert_eq!(
            s.has_texture_atlas_region("walk_1"),
            has_texture_atlas_region(&s, "walk_1")
        );
    }

    #[test]
    fn textureatlas_initialize_texture_atlas_matches_initialize_texture_atlas() {
        let (mut a, mut b) = (atlas(), atlas());
        let options = TextureAtlasOptions {
            scale: Some(2.0),
            ..TextureAtlasOptions::default()
        };
        a.initialize_texture_atlas(Some(options.clone()));
        initialize_texture_atlas(&mut b, Some(options));
        assert_eq!(shown(&a), shown(&b));
    }

    #[test]
    fn textureatlas_remove_texture_atlas_region_matches_remove_texture_atlas_region() {
        let (mut a, mut b) = (atlas(), atlas());
        assert_eq!(
            a.remove_texture_atlas_region(0),
            remove_texture_atlas_region(&mut b, 0)
        );
        assert_eq!(region_names(&a), region_names(&b));
    }

    #[test]
    fn textureatlasregion_get_texture_atlas_region_frame_matches_get_texture_atlas_region_frame() {
        let s = region();
        let (mut a, mut b) = (
            create_rectangle(0.0, 0.0, 0.0, 0.0),
            create_rectangle(0.0, 0.0, 0.0, 0.0),
        );
        s.get_texture_atlas_region_frame(&mut a);
        get_texture_atlas_region_frame(&mut b, &s);
        assert_eq!(shown(&a), shown(&b));
    }

    #[test]
    fn textureatlasregion_get_texture_atlas_region_ordinal_matches_get_texture_atlas_region_ordinal()
     {
        let s = region();
        assert_eq!(
            s.get_texture_atlas_region_ordinal(),
            get_texture_atlas_region_ordinal(&s)
        );
    }

    #[test]
    fn textureatlasregion_get_texture_atlas_region_uv_matches_get_texture_atlas_region_uv() {
        let s = region();
        let (mut a, mut b) = (
            create_rectangle(0.0, 0.0, 0.0, 0.0),
            create_rectangle(0.0, 0.0, 0.0, 0.0),
        );
        s.get_texture_atlas_region_uv(&mut a, 100.0, 50.0);
        get_texture_atlas_region_uv(&mut b, &s, 100.0, 50.0);
        assert_eq!(shown(&a), shown(&b));
    }

    #[test]
    fn textureatlasregion_get_texture_atlas_region_uv_quad_matches_get_texture_atlas_region_uv_quad()
     {
        let s = region();
        let (mut a, mut b) = (Vec::new(), Vec::new());
        s.get_texture_atlas_region_uv_quad(&mut a, 100.0, 50.0);
        get_texture_atlas_region_uv_quad(&mut b, &s, 100.0, 50.0);
        assert_eq!(a, b);
    }

    #[test]
    fn textureatlasregion_initialize_texture_atlas_region_matches_initialize_texture_atlas_region()
    {
        let (mut a, mut b) = (region(), region());
        a.initialize_texture_atlas_region(None);
        initialize_texture_atlas_region(&mut b, None);
        assert_eq!(a, b);
    }

    #[test]
    fn textureatlasregion_set_texture_atlas_region_matches_set_texture_atlas_region() {
        let (mut a, mut b) = (region(), region());
        let source = TextureAtlasRegionOptions {
            x: Some(9.0),
            trimmed: Some(true),
            ..TextureAtlasRegionOptions::default()
        };
        a.set_texture_atlas_region(&source);
        set_texture_atlas_region(&mut b, &source);
        assert_eq!(a, b);
    }

    #[test]
    fn textureatlasguardstate_are_texture_atlas_guards_enabled_matches_are_texture_atlas_guards_enabled()
     {
        let s = guards();
        assert_eq!(
            s.are_texture_atlas_guards_enabled(),
            are_texture_atlas_guards_enabled(&s)
        );
    }

    #[test]
    fn textureatlasguardstate_disable_texture_atlas_guards_matches_disable_texture_atlas_guards() {
        let logs = Arc::new(RwLock::new(create_log_state()));
        let (mut a, mut b) = (guards(), guards());
        enable_texture_atlas_guards(&mut a, &logs, Arc::new(|| 0.0));
        enable_texture_atlas_guards(&mut b, &logs, Arc::new(|| 0.0));
        a.disable_texture_atlas_guards();
        disable_texture_atlas_guards(&mut b);
        assert_eq!(shown(&a), shown(&b));
    }

    #[test]
    fn textureatlasguardstate_enable_texture_atlas_guards_matches_enable_texture_atlas_guards() {
        let logs = Arc::new(RwLock::new(create_log_state()));
        let (mut a, mut b) = (guards(), guards());
        a.enable_texture_atlas_guards(&logs, Arc::new(|| 0.0));
        enable_texture_atlas_guards(&mut b, &logs, Arc::new(|| 0.0));
        assert_eq!(shown(&a), shown(&b));
    }

    #[test]
    fn textureatlasguardstate_set_texture_atlas_region_texture_guard_matches_set_texture_atlas_region_texture_guard()
     {
        let (mut a, mut b) = (guards(), guards());
        let guard: TextureAtlasRegionTextureGuard = Arc::new(|_atlas, _id, _explanation| {});
        a.set_texture_atlas_region_texture_guard(Some(guard.clone()));
        set_texture_atlas_region_texture_guard(&mut b, Some(guard));
        assert_eq!(shown(&a), shown(&b));
    }

    #[test]
    fn gridsliceoptions_create_texture_atlas_from_grid_matches_create_texture_atlas_from_grid() {
        let s = grid();
        let (a, b) = (
            s.create_texture_atlas_from_grid(None),
            create_texture_atlas_from_grid(&s, None),
        );
        assert_eq!(region_names(&a), region_names(&b));
    }
}

impl TextureAtlas {
    pub fn initialize_texture_atlas(&mut self, obj: Option<TextureAtlasOptions>) {
        initialize_texture_atlas(self, obj);
    }

    pub fn add_texture_atlas_region(
        &mut self,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        pivot_x: Option<f32>,
        pivot_y: Option<f32>,
        name: Option<&str>,
    ) {
        add_texture_atlas_region(self, x, y, width, height, pivot_x, pivot_y, name);
    }

    pub fn add_texture_atlas_region_corners(
        &mut self,
        ax: f32,
        ay: f32,
        bx: f32,
        by: f32,
        pivot_x: Option<f32>,
        pivot_y: Option<f32>,
        name: Option<&str>,
    ) {
        add_texture_atlas_region_corners(self, ax, ay, bx, by, pivot_x, pivot_y, name);
    }

    pub fn add_texture_atlas_region_rectangle(
        &mut self,
        rect: &Rectangle,
        pivot: Option<&Vector2>,
        name: Option<&str>,
    ) {
        add_texture_atlas_region_rectangle(self, rect, pivot, name);
    }

    pub fn add_texture_atlas_region_vector2(
        &mut self,
        a: &Vector2,
        b: &Vector2,
        pivot: Option<&Vector2>,
        name: Option<&str>,
    ) {
        add_texture_atlas_region_vector2(self, a, b, pivot, name);
    }

    pub fn build_texture_atlas_region_index(&self) -> HashMap<String, Ref<TextureAtlasRegion>> {
        return build_texture_atlas_region_index(self);
    }

    pub fn clear_texture_atlas_regions(&mut self) {
        clear_texture_atlas_regions(self);
    }

    pub fn dispose_texture_atlas(&mut self) {
        dispose_texture_atlas(self);
    }

    pub fn explain_texture_atlas_region_texture(
        &self,
        region_id: i32,
    ) -> TextureAtlasRegionTextureExplanation {
        return explain_texture_atlas_region_texture(self, region_id);
    }

    pub fn get_texture_atlas_byte_size(&self) -> usize {
        return get_texture_atlas_byte_size(self);
    }

    pub fn get_texture_atlas_region_by_id(&self, id: i32) -> Option<Ref<TextureAtlasRegion>> {
        return get_texture_atlas_region_by_id(self, id);
    }

    pub fn get_texture_atlas_region_by_name(&self, name: &str) -> Option<Ref<TextureAtlasRegion>> {
        return get_texture_atlas_region_by_name(self, name);
    }

    // flight-lint: allow(f64) D1: ordinals are JS numbers accumulated digit by digit
    pub fn get_texture_atlas_region_by_ordinal(
        &self,
        prefix: &str,
        ordinal: f64,
    ) -> Option<Ref<TextureAtlasRegion>> {
        return get_texture_atlas_region_by_ordinal(self, prefix, ordinal);
    }

    pub fn get_texture_atlas_region_count(&self) -> usize {
        return get_texture_atlas_region_count(self);
    }

    pub fn get_texture_atlas_region_sequence(
        &self,
        out: &mut Vec<Ref<TextureAtlasRegion>>,
        prefix: &str,
    ) {
        get_texture_atlas_region_sequence(out, self, prefix);
    }

    pub fn get_texture_atlas_region_texture(
        &self,
        region_id: i32,
        guards: Option<&TextureAtlasGuardState>,
    ) -> Option<Ref<Texture2D>> {
        return get_texture_atlas_region_texture(self, region_id, guards);
    }

    pub fn has_texture_atlas_region(&self, name: &str) -> bool {
        return has_texture_atlas_region(self, name);
    }

    pub fn remove_texture_atlas_region(&mut self, id: i32) -> bool {
        return remove_texture_atlas_region(self, id);
    }
}

impl TextureAtlasRegion {
    pub fn initialize_texture_atlas_region(&mut self, obj: Option<&TextureAtlasRegionOptions>) {
        initialize_texture_atlas_region(self, obj);
    }

    pub fn get_texture_atlas_region_frame(&self, out: &mut Rectangle) {
        get_texture_atlas_region_frame(out, self);
    }

    // flight-lint: allow(f64) D1: ordinals are JS numbers accumulated digit by digit
    pub fn get_texture_atlas_region_ordinal(&self) -> f64 {
        return get_texture_atlas_region_ordinal(self);
    }

    pub fn get_texture_atlas_region_uv(
        &self,
        out: &mut Rectangle,
        image_width: f32,
        image_height: f32,
    ) {
        get_texture_atlas_region_uv(out, self, image_width, image_height);
    }

    pub fn get_texture_atlas_region_uv_quad(
        &self,
        out: &mut Vec<f32>,
        image_width: f32,
        image_height: f32,
    ) {
        get_texture_atlas_region_uv_quad(out, self, image_width, image_height);
    }

    pub fn set_texture_atlas_region(&mut self, source: &TextureAtlasRegionOptions) {
        set_texture_atlas_region(self, source);
    }
}

impl TextureAtlasGuardState {
    pub fn are_texture_atlas_guards_enabled(&self) -> bool {
        return are_texture_atlas_guards_enabled(self);
    }

    pub fn disable_texture_atlas_guards(&mut self) {
        disable_texture_atlas_guards(self);
    }

    // flight-lint: allow(f64) D0: the injected flight-log clock returns millisecond timestamps
    pub fn enable_texture_atlas_guards(
        &mut self,
        log_state: &LogStateRef,
        clock: Arc<dyn Fn() -> f64 + Send + Sync>,
    ) {
        return enable_texture_atlas_guards(self, log_state, clock);
    }

    pub fn set_texture_atlas_region_texture_guard(
        &mut self,
        guard: Option<TextureAtlasRegionTextureGuard>,
    ) {
        set_texture_atlas_region_texture_guard(self, guard);
    }
}

impl GridSliceOptions {
    pub fn create_texture_atlas_from_grid(&self, texture: Option<Ref<Texture2D>>) -> TextureAtlas {
        return create_texture_atlas_from_grid(self, texture);
    }
}
