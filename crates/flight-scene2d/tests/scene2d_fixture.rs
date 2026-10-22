use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref, allocate_entity};
use flight_node::NodeRef;
use flight_scene2d::contract::*;
use flight_texture::{Texture, TextureSourceRef, VoxelGrid, create_texture_2d};

/// A texture over a sized stand-in source (TS `createTexture({ dimension: '2d', source })`).
pub fn texture(width: u32, height: u32) -> Ref<Texture> {
    let mut grid: VoxelGrid = allocate_entity();
    grid.width = width;
    grid.height = height;
    let source: TextureSourceRef = Arc::new(RwLock::new(grid));
    let mut texture = create_texture_2d();
    texture.source = Some(source);
    return Arc::new(RwLock::new(Texture::Texture2D(texture)));
}

pub fn as_node(source: &Node2DRef) -> NodeRef {
    return source.clone();
}

pub fn display_object() -> Node2DRef {
    return create_display_object();
}

/// A caller-declared 2D kind with its own data (the source tests' `Node2DTest`).
#[derive(Default)]
pub struct Node2DTest {
    node: Node2DFields,
    pub data: Node2DTestData,
}

#[derive(Debug, Default)]
pub struct Node2DTestData {
    runtime: EntityRuntimeSlot,
    pub foo: String,
}

flight_entity::impl_entity!(Node2DTestData);

flight_scene2d::impl_node2d!(Node2DTest);

/// The source's `createNode2DTestData`: `foo` defaults to `"bar"`.
pub fn create_node2d_test_data(foo: Option<&str>) -> Node2DTestData {
    let mut out: Node2DTestData = allocate_entity();
    out.foo = foo.unwrap_or("bar").to_string();
    return out;
}

/// A recorded stream of source tokens (TS `ShapeCommandToken[]` in these tests: keys and numbers).
#[derive(Clone, Debug)]
pub enum TestToken {
    Key(&'static str),
    Number(f64),
}

pub struct TestStream {
    pub tokens: Vec<TestToken>,
}

impl Node2DShapeCommandStream for TestStream {
    fn len(&self) -> usize {
        return self.tokens.len();
    }

    fn key_at(&self, index: usize) -> Option<&str> {
        return match self.tokens.get(index) {
            Some(TestToken::Key(key)) => Some(key),
            _ => None,
        };
    }

    fn arg_count_at(&self, index: usize) -> f64 {
        return match self.tokens.get(index) {
            Some(TestToken::Number(value)) => *value,
            _ => f64::NAN,
        };
    }

    fn arg_at(&self, index: usize) -> Option<&dyn std::any::Any> {
        return self
            .tokens
            .get(index)
            .map(|token| token as &dyn std::any::Any);
    }
}

/// A display-object kind whose data carries a command stream (the source tests' `shapeLikeNode`).
#[derive(Default)]
pub struct ShapeLikeNode {
    node: Node2DFields,
    pub data: Option<TestStream>,
}

flight_scene2d::impl_node2d!(ShapeLikeNode, custom_node2d);

impl Node2D for ShapeLikeNode {
    fn node2d_fields(&self) -> &Node2DFields {
        return &self.node;
    }

    fn node2d_fields_mut(&mut self) -> &mut Node2DFields {
        return &mut self.node;
    }

    fn shape_command_stream(&self) -> Option<&dyn Node2DShapeCommandStream> {
        return self
            .data
            .as_ref()
            .map(|stream| stream as &dyn Node2DShapeCommandStream);
    }
}

pub fn shape_like_node(tokens: Vec<TestToken>) -> Node2DRef {
    let mut node: ShapeLikeNode = create_node2d(DISPLAY_OBJECT_KIND.to_string(), None);
    node.data = Some(TestStream { tokens });
    return Arc::new(RwLock::new(node));
}

/// A bare node of no 2D family (a flight-node kind with only the common fields).
#[derive(Default)]
pub struct PlainNode {
    pub fields: flight_node::NodeFields,
}

impl flight_entity::Entity for PlainNode {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.fields.entity_runtime();
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.fields.entity_runtime_mut();
    }
}

impl flight_node::Node for PlainNode {
    fn node_fields(&self) -> &flight_node::NodeFields {
        return &self.fields;
    }

    fn node_fields_mut(&mut self) -> &mut flight_node::NodeFields {
        return &mut self.fields;
    }

    fn as_any(&self) -> &dyn std::any::Any {
        return self;
    }

    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        return self;
    }
}

pub fn plain_node(kind: &str) -> NodeRef {
    let node: PlainNode = flight_node::create_node(kind.to_string());
    return Arc::new(RwLock::new(node));
}
