//! D18 Rust conveniences: each method delegates to one public free function. Shared-handle
//! receivers (`Ref<dyn Node2D>`, `Ref<HtmlView>`, `Ref<Scene2D>`) take their methods through
//! extension traits.

use flight_clip::ClipRegion;
use flight_entity::Ref;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, RwLock};

    use flight_entity::Ref;
    use flight_geometry::create_rectangle;
    use flight_node::{NodeRef, add_node_child};
    use flight_texture::{
        CreateTexture2DOptions, CreateTextureCommonOptions, Texture, TextureSourceRef, VoxelGrid,
        create_texture_2d,
    };

    use crate::contract::*;
    use crate::sugar::{HtmlViewRefMethods, Node2DRefMethods, Scene2DRefMethods};

    fn texture() -> Ref<Texture> {
        let mut grid: VoxelGrid = flight_entity::allocate_entity();
        grid.width = 6;
        grid.height = 4;
        let source: TextureSourceRef = Arc::new(RwLock::new(grid));
        let options = CreateTexture2DOptions {
            common: CreateTextureCommonOptions::default(),
            source: Some(source),
        };
        return Arc::new(RwLock::new(Texture::Texture2D(create_texture_2d(Some(
            &options,
        )))));
    }

    fn sprite() -> Ref<Sprite> {
        let sprite = create_sprite();
        sprite.write().unwrap().data.texture = Some(texture());
        return sprite;
    }

    fn show<T: std::fmt::Debug>(value: &T) -> String {
        return format!("{:?}", value);
    }

    #[test]
    fn displayobject_get_display_object_runtime_matches_get_display_object_runtime() {
        let shared = create_display_object();
        let obj = shared.read().unwrap();
        assert!(std::ptr::eq(
            obj.get_display_object_runtime(),
            get_display_object_runtime(&obj)
        ));
    }

    #[test]
    fn dynnode2d_get_node2d_runtime_matches_get_node2d_runtime() {
        let shared: Node2DRef = sprite();
        let obj = shared.read().unwrap();
        assert!(std::ptr::eq(
            obj.get_node2d_runtime(),
            get_node2d_runtime(&*obj)
        ));
    }

    #[test]
    fn htmlview_get_html_view_runtime_matches_get_html_view_runtime() {
        let shared = create_html_view();
        let view = shared.read().unwrap();
        assert!(std::ptr::eq(
            view.get_html_view_runtime(),
            get_html_view_runtime(&view)
        ));
    }

    #[test]
    fn htmlviewdata_initialize_html_view_data_matches_initialize_html_view_data() {
        let (mut a, mut b) = (create_html_view_data(), create_html_view_data());
        a.initialize_html_view_data();
        initialize_html_view_data(&mut b);
        assert_eq!(show(&a), show(&b));
    }

    #[test]
    fn htmlviewref_set_html_view_size_matches_set_html_view_size() {
        let (a, b) = (create_html_view(), create_html_view());
        a.set_html_view_size(30.0, 40.0);
        set_html_view_size(&b, 30.0, 40.0);
        assert_eq!(show(&*a.read().unwrap()), show(&*b.read().unwrap()));
    }

    #[test]
    fn scene2dalign_get_scene2d_align_string_matches_get_scene2d_align_string() {
        let value = Scene2DAlign::BottomRight;
        assert_eq!(
            value.get_scene2d_align_string(),
            get_scene2d_align_string(value)
        );
    }

    #[test]
    fn node2danimationpath_get_node2d_animation_path_string_matches_get_node2d_animation_path_string()
     {
        let value = Node2DAnimationPath::PivotY;
        assert_eq!(
            value.get_node2d_animation_path_string(),
            get_node2d_animation_path_string(value)
        );
    }

    #[test]
    fn node2dref_get_scene2d_root_matches_get_scene2d_root() {
        let scene2d = create_scene2d();
        let child: Node2DRef = create_display_object();
        let root: NodeRef = scene2d.read().unwrap().root.clone();
        add_node_child(&root, &(child.clone() as NodeRef));
        let a = child.get_scene2d_root().unwrap();
        let b = get_scene2d_root(&child).unwrap();
        assert!(Arc::ptr_eq(&a, &b) && Arc::ptr_eq(&a, &scene2d));
    }

    #[test]
    fn node2dref_set_node2d_clip_matches_set_node2d_clip() {
        let clip =
            flight_clip::create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 2.0, 2.0));
        let (a, b): (Node2DRef, Node2DRef) =
            (create_display_object(), create_display_object());
        a.set_node2d_clip(Some(clip.clone()));
        set_node2d_clip(&b, Some(clip.clone()));
        let (a, b) = (a.read().unwrap(), b.read().unwrap());
        assert!(Arc::ptr_eq(a.node2d_fields().clip.as_ref().unwrap(), &clip));
        assert!(Arc::ptr_eq(b.node2d_fields().clip.as_ref().unwrap(), &clip));
        assert_eq!(
            flight_node::get_node_appearance_revision(&*a),
            flight_node::get_node_appearance_revision(&*b)
        );
    }

    #[test]
    fn scale9sprite_get_scale9_sprite_runtime_matches_get_scale9_sprite_runtime() {
        let shared = create_scale9_sprite(&create_rectangle(1.0, 1.0, 2.0, 2.0));
        let sprite = shared.read().unwrap();
        assert!(Arc::ptr_eq(
            &sprite.get_scale9_sprite_runtime(),
            &get_scale9_sprite_runtime(&sprite)
        ));
    }

    #[test]
    fn scale9spritedata_initialize_scale9_sprite_data_matches_initialize_scale9_sprite_data() {
        let grid = create_rectangle(1.0, 2.0, 3.0, 4.0);
        let mut a = create_scale9_sprite_data(&grid);
        let mut b = create_scale9_sprite_data(&grid);
        a.initialize_scale9_sprite_data(&grid);
        initialize_scale9_sprite_data(&mut b, &grid);
        assert_eq!(a.scale9_grid, b.scale9_grid);
        assert!(a.texture.is_none() && b.texture.is_none());
    }

    #[test]
    fn scene2d_enable_scene2d_signals_matches_enable_scene2d_signals() {
        let scene2d = create_scene2d();
        let a = scene2d.write().unwrap().enable_scene2d_signals();
        let b = enable_scene2d_signals(&mut scene2d.write().unwrap());
        assert!(Arc::ptr_eq(&a, &b));
    }

    #[test]
    fn scene2d_get_scene2d_runtime_matches_get_scene2d_runtime() {
        let (a, b) = (create_scene2d(), create_scene2d());
        let a_signals = a
            .write()
            .unwrap()
            .get_scene2d_runtime()
            .scene2d_signals
            .is_none();
        let b_signals = get_scene2d_runtime(&mut b.write().unwrap())
            .scene2d_signals
            .is_none();
        assert_eq!(a_signals, b_signals);
    }

    #[test]
    fn scene2d_get_scene2d_signals_matches_get_scene2d_signals() {
        let scene2d = create_scene2d();
        assert!(scene2d.read().unwrap().get_scene2d_signals().is_none());
        enable_scene2d_signals(&mut scene2d.write().unwrap());
        let guard = scene2d.read().unwrap();
        assert!(Arc::ptr_eq(
            &guard.get_scene2d_signals().unwrap(),
            &get_scene2d_signals(&guard).unwrap()
        ));
    }

    #[test]
    fn scene2d_initialize_scene2d_matches_initialize_scene2d() {
        let root: Node2DRef = create_display_object();
        let (mut a, mut b) = (Scene2D::default(), Scene2D::default());
        a.initialize_scene2d(root.clone());
        initialize_scene2d(&mut b, root.clone());
        assert_eq!(show(&a), show(&b));
        assert!(Arc::ptr_eq(&a.root, &b.root));
    }

    #[test]
    fn scene2ddisplaystate_get_scene2d_display_state_string_matches_get_scene2d_display_state_string()
     {
        let value = Scene2DDisplayState::FullscreenInteractive;
        assert_eq!(
            value.get_scene2d_display_state_string(),
            get_scene2d_display_state_string(value)
        );
    }

    #[test]
    fn scene2dkindusage_initialize_scene2d_kind_usage_matches_initialize_scene2d_kind_usage() {
        let mut a = create_scene2d_kind_usage();
        let mut b = create_scene2d_kind_usage();
        a.node_kinds.push("X".to_string());
        b.node_kinds.push("X".to_string());
        a.initialize_scene2d_kind_usage();
        initialize_scene2d_kind_usage(&mut b);
        assert_eq!(a, b);
    }

    #[test]
    fn scene2dquality_get_scene2d_quality_string_matches_get_scene2d_quality_string() {
        let value = Scene2DQuality::Medium;
        assert_eq!(
            value.get_scene2d_quality_string(),
            get_scene2d_quality_string(value)
        );
    }

    #[test]
    fn scene2dref_set_scene2d_size_matches_set_scene2d_size() {
        let (a, b) = (create_scene2d(), create_scene2d());
        a.set_scene2d_size(800.0, 600.0);
        set_scene2d_size(&b, 800.0, 600.0);
        assert_eq!(show(&*a.read().unwrap()), show(&*b.read().unwrap()));
    }

    #[test]
    fn scene2dscalemode_get_scene2d_scale_mode_string_matches_get_scene2d_scale_mode_string() {
        let value = Scene2DScaleMode::ExactFit;
        assert_eq!(
            value.get_scene2d_scale_mode_string(),
            get_scene2d_scale_mode_string(value)
        );
    }

    #[test]
    fn scene2dsignals_initialize_scene2d_signals_matches_initialize_scene2d_signals() {
        let (a, b) = (create_scene2d_signals(), create_scene2d_signals());
        let old = a.read().unwrap().on_resize.clone();
        a.write().unwrap().initialize_scene2d_signals();
        initialize_scene2d_signals(&mut b.write().unwrap());
        assert!(!Arc::ptr_eq(&a.read().unwrap().on_resize.data, &old.data));
        assert!(!Arc::ptr_eq(
            &a.read().unwrap().on_resize.data,
            &b.read().unwrap().on_resize.data
        ));
    }

    #[test]
    fn sprite_clone_sprite_matches_clone_sprite() {
        let shared = sprite();
        let source = shared.read().unwrap();
        let (a, b) = (source.clone_sprite(), clone_sprite(&source));
        assert_eq!(show(&*a.read().unwrap()), show(&*b.read().unwrap()));
        assert!(Arc::ptr_eq(
            a.read().unwrap().data.texture.as_ref().unwrap(),
            b.read().unwrap().data.texture.as_ref().unwrap()
        ));
    }

    #[test]
    fn sprite_get_sprite_runtime_matches_get_sprite_runtime() {
        let shared = sprite();
        let source = shared.read().unwrap();
        assert!(Arc::ptr_eq(
            &source.get_sprite_runtime(),
            &get_sprite_runtime(&source)
        ));
    }

    #[test]
    fn spritedata_initialize_sprite_data_matches_initialize_sprite_data() {
        let (mut a, mut b) = (create_sprite_data(), create_sprite_data());
        a.initialize_sprite_data();
        initialize_sprite_data(&mut b);
        assert!(a.texture.is_none() && b.texture.is_none());
    }
}

/// D18 methods on a shared 2D node handle.
pub trait Node2DRefMethods {
    fn get_scene2d_root(&self) -> Option<Ref<Scene2D>>;

    fn set_node2d_clip(&self, value: Option<Ref<ClipRegion>>);
}

/// D18 methods on a shared html view handle.
pub trait HtmlViewRefMethods {
    // flight-lint: allow(f64) D1: the element size is a JS number
    fn set_html_view_size(&self, width: f64, height: f64);
}

/// D18 methods on a shared scene handle.
pub trait Scene2DRefMethods {
    // flight-lint: allow(f64) D1: the view size is a JS number
    fn set_scene2d_size(&self, width: f64, height: f64);
}

impl Node2DRefMethods for Node2DRef {
    fn get_scene2d_root(&self) -> Option<Ref<Scene2D>> {
        return get_scene2d_root(self);
    }

    fn set_node2d_clip(&self, value: Option<Ref<ClipRegion>>) {
        set_node2d_clip(self, value);
    }
}

impl HtmlViewRefMethods for Ref<HtmlView> {
    // flight-lint: allow(f64) D1: the element size is a JS number
    fn set_html_view_size(&self, width: f64, height: f64) {
        set_html_view_size(self, width, height);
    }
}

impl Scene2DRefMethods for Ref<Scene2D> {
    // flight-lint: allow(f64) D1: the view size is a JS number
    fn set_scene2d_size(&self, width: f64, height: f64) {
        set_scene2d_size(self, width, height);
    }
}

impl dyn Node2D {
    pub fn get_node2d_runtime(&self) -> &Node2DRuntime {
        return get_node2d_runtime(self);
    }
}

impl DisplayObject {
    pub fn get_display_object_runtime(&self) -> &DisplayObjectRuntime {
        return get_display_object_runtime(self);
    }
}

impl HtmlView {
    pub fn get_html_view_runtime(&self) -> &HtmlViewRuntime {
        return get_html_view_runtime(self);
    }
}

impl HtmlViewData {
    pub fn initialize_html_view_data(&mut self) {
        initialize_html_view_data(self);
    }
}

impl Node2DAnimationPath {
    pub fn get_node2d_animation_path_string(self) -> &'static str {
        return get_node2d_animation_path_string(self);
    }
}

impl Scale9Sprite {
    pub fn get_scale9_sprite_runtime(&self) -> Ref<Scale9SpriteRuntime> {
        return get_scale9_sprite_runtime(self);
    }
}

impl Scale9SpriteData {
    pub fn initialize_scale9_sprite_data(
        &mut self,
        scale9_grid: &flight_geometry::Rectangle,
    ) {
        initialize_scale9_sprite_data(self, scale9_grid);
    }
}

impl Scene2D {
    pub fn initialize_scene2d(&mut self, root: Node2DRef) {
        initialize_scene2d(self, root);
    }

    pub fn enable_scene2d_signals(&mut self) -> Ref<Scene2DSignals> {
        return enable_scene2d_signals(self);
    }

    pub fn get_scene2d_runtime(&mut self) -> &Scene2DRuntime {
        return get_scene2d_runtime(self);
    }

    pub fn get_scene2d_signals(&self) -> Option<Ref<Scene2DSignals>> {
        return get_scene2d_signals(self);
    }
}

impl Scene2DAlign {
    pub fn get_scene2d_align_string(self) -> &'static str {
        return get_scene2d_align_string(self);
    }
}

impl Scene2DDisplayState {
    pub fn get_scene2d_display_state_string(self) -> &'static str {
        return get_scene2d_display_state_string(self);
    }
}

impl Scene2DKindUsage {
    pub fn initialize_scene2d_kind_usage(&mut self) {
        initialize_scene2d_kind_usage(self);
    }
}

impl Scene2DQuality {
    pub fn get_scene2d_quality_string(self) -> &'static str {
        return get_scene2d_quality_string(self);
    }
}

impl Scene2DScaleMode {
    pub fn get_scene2d_scale_mode_string(self) -> &'static str {
        return get_scene2d_scale_mode_string(self);
    }
}

impl Scene2DSignals {
    pub fn initialize_scene2d_signals(&mut self) {
        initialize_scene2d_signals(self);
    }
}

impl Sprite {
    pub fn clone_sprite(&self) -> Ref<Sprite> {
        return clone_sprite(self);
    }

    pub fn get_sprite_runtime(&self) -> Ref<SpriteRuntime> {
        return get_sprite_runtime(self);
    }
}

impl SpriteData {
    pub fn initialize_sprite_data(&mut self) {
        initialize_sprite_data(self);
    }
}
