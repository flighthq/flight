#[derive(Clone, Copy)]
struct RiveCoreTypeRow {
    key: i32,
    name: &'static str,
    parent: i32,
}

fn find_rive_core_type(type_key: i32) -> Option<&'static RiveCoreTypeRow> {
    let index = RIVE_CORE_TYPES
        .binary_search_by_key(&type_key, |row| row.key)
        .ok()?;
    return RIVE_CORE_TYPES.get(index);
}

/// Returns the type name for a key from Rive's built-in object model.
pub fn get_rive_core_type_name(type_key: i32) -> Option<&'static str> {
    return find_rive_core_type(type_key).map(|row| row.name);
}

/// Returns the immediate parent key, `-1` for a root, or `None` for an unknown type.
pub fn get_rive_core_type_parent(type_key: i32) -> Option<i32> {
    return find_rive_core_type(type_key).map(|row| row.parent);
}

/// Reports whether `type_key` is `ancestor_type_key` or derives from it.
pub fn is_rive_core_type_derived_from(type_key: i32, ancestor_type_key: i32) -> bool {
    let mut current = Some(type_key);
    while let Some(key) = current {
        if key == RIVE_NO_PARENT {
            break;
        }
        if key == ancestor_type_key {
            return true;
        }
        current = get_rive_core_type_parent(key);
    }
    return false;
}

const RIVE_NO_PARENT: i32 = -1;

const RIVE_CORE_TYPES: &[RiveCoreTypeRow] = &[
    RiveCoreTypeRow {
        key: 1,
        name: "Artboard",
        parent: 409,
    },
    RiveCoreTypeRow {
        key: 2,
        name: "Node",
        parent: 38,
    },
    RiveCoreTypeRow {
        key: 3,
        name: "Shape",
        parent: 13,
    },
    RiveCoreTypeRow {
        key: 4,
        name: "Ellipse",
        parent: 15,
    },
    RiveCoreTypeRow {
        key: 5,
        name: "StraightVertex",
        parent: 14,
    },
    RiveCoreTypeRow {
        key: 6,
        name: "CubicDetachedVertex",
        parent: 36,
    },
    RiveCoreTypeRow {
        key: 7,
        name: "Rectangle",
        parent: 15,
    },
    RiveCoreTypeRow {
        key: 8,
        name: "Triangle",
        parent: 15,
    },
    RiveCoreTypeRow {
        key: 9,
        name: "BindableProperty",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 10,
        name: "Component",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 11,
        name: "ContainerComponent",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 12,
        name: "Path",
        parent: 2,
    },
    RiveCoreTypeRow {
        key: 13,
        name: "Drawable",
        parent: 2,
    },
    RiveCoreTypeRow {
        key: 14,
        name: "PathVertex",
        parent: 107,
    },
    RiveCoreTypeRow {
        key: 15,
        name: "ParametricPath",
        parent: 12,
    },
    RiveCoreTypeRow {
        key: 16,
        name: "PointsPath",
        parent: 620,
    },
    RiveCoreTypeRow {
        key: 17,
        name: "RadialGradient",
        parent: 22,
    },
    RiveCoreTypeRow {
        key: 18,
        name: "SolidColor",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 19,
        name: "GradientStop",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 20,
        name: "Fill",
        parent: 21,
    },
    RiveCoreTypeRow {
        key: 21,
        name: "ShapePaint",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 22,
        name: "LinearGradient",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 23,
        name: "Backboard",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 24,
        name: "Stroke",
        parent: 21,
    },
    RiveCoreTypeRow {
        key: 25,
        name: "KeyedObject",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 26,
        name: "KeyedProperty",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 27,
        name: "Animation",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 28,
        name: "CubicEaseInterpolator",
        parent: 139,
    },
    RiveCoreTypeRow {
        key: 29,
        name: "KeyFrame",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 30,
        name: "KeyFrameDouble",
        parent: 170,
    },
    RiveCoreTypeRow {
        key: 31,
        name: "LinearAnimation",
        parent: 550,
    },
    RiveCoreTypeRow {
        key: 34,
        name: "CubicAsymmetricVertex",
        parent: 36,
    },
    RiveCoreTypeRow {
        key: 35,
        name: "CubicMirroredVertex",
        parent: 36,
    },
    RiveCoreTypeRow {
        key: 36,
        name: "CubicVertex",
        parent: 14,
    },
    RiveCoreTypeRow {
        key: 37,
        name: "KeyFrameColor",
        parent: 170,
    },
    RiveCoreTypeRow {
        key: 38,
        name: "TransformComponent",
        parent: 91,
    },
    RiveCoreTypeRow {
        key: 39,
        name: "SkeletalComponent",
        parent: 38,
    },
    RiveCoreTypeRow {
        key: 40,
        name: "Bone",
        parent: 39,
    },
    RiveCoreTypeRow {
        key: 41,
        name: "RootBone",
        parent: 40,
    },
    RiveCoreTypeRow {
        key: 42,
        name: "ClippingShape",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 43,
        name: "Skin",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 44,
        name: "Tendon",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 45,
        name: "Weight",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 46,
        name: "CubicWeight",
        parent: 45,
    },
    RiveCoreTypeRow {
        key: 47,
        name: "TrimPath",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 48,
        name: "DrawTarget",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 49,
        name: "DrawRules",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 50,
        name: "KeyFrameId",
        parent: 170,
    },
    RiveCoreTypeRow {
        key: 51,
        name: "Polygon",
        parent: 15,
    },
    RiveCoreTypeRow {
        key: 52,
        name: "Star",
        parent: 51,
    },
    RiveCoreTypeRow {
        key: 53,
        name: "StateMachine",
        parent: 551,
    },
    RiveCoreTypeRow {
        key: 54,
        name: "StateMachineComponent",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 55,
        name: "StateMachineInput",
        parent: 54,
    },
    RiveCoreTypeRow {
        key: 56,
        name: "StateMachineNumber",
        parent: 55,
    },
    RiveCoreTypeRow {
        key: 57,
        name: "StateMachineLayer",
        parent: 54,
    },
    RiveCoreTypeRow {
        key: 58,
        name: "StateMachineTrigger",
        parent: 55,
    },
    RiveCoreTypeRow {
        key: 59,
        name: "StateMachineBool",
        parent: 55,
    },
    RiveCoreTypeRow {
        key: 60,
        name: "LayerState",
        parent: 66,
    },
    RiveCoreTypeRow {
        key: 61,
        name: "AnimationState",
        parent: 145,
    },
    RiveCoreTypeRow {
        key: 62,
        name: "AnyState",
        parent: 60,
    },
    RiveCoreTypeRow {
        key: 63,
        name: "EntryState",
        parent: 60,
    },
    RiveCoreTypeRow {
        key: 64,
        name: "ExitState",
        parent: 60,
    },
    RiveCoreTypeRow {
        key: 65,
        name: "StateTransition",
        parent: 66,
    },
    RiveCoreTypeRow {
        key: 66,
        name: "StateMachineLayerComponent",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 67,
        name: "TransitionInputCondition",
        parent: 476,
    },
    RiveCoreTypeRow {
        key: 68,
        name: "TransitionTriggerCondition",
        parent: 67,
    },
    RiveCoreTypeRow {
        key: 69,
        name: "TransitionValueCondition",
        parent: 67,
    },
    RiveCoreTypeRow {
        key: 70,
        name: "TransitionNumberCondition",
        parent: 69,
    },
    RiveCoreTypeRow {
        key: 71,
        name: "TransitionBoolCondition",
        parent: 69,
    },
    RiveCoreTypeRow {
        key: 72,
        name: "BlendState",
        parent: 60,
    },
    RiveCoreTypeRow {
        key: 73,
        name: "BlendStateDirect",
        parent: 72,
    },
    RiveCoreTypeRow {
        key: 74,
        name: "BlendAnimation",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 75,
        name: "BlendAnimation1D",
        parent: 74,
    },
    RiveCoreTypeRow {
        key: 76,
        name: "BlendState1DInput",
        parent: 527,
    },
    RiveCoreTypeRow {
        key: 77,
        name: "BlendAnimationDirect",
        parent: 74,
    },
    RiveCoreTypeRow {
        key: 78,
        name: "BlendStateTransition",
        parent: 65,
    },
    RiveCoreTypeRow {
        key: 79,
        name: "Constraint",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 80,
        name: "TargetedConstraint",
        parent: 79,
    },
    RiveCoreTypeRow {
        key: 81,
        name: "IKConstraint",
        parent: 80,
    },
    RiveCoreTypeRow {
        key: 82,
        name: "DistanceConstraint",
        parent: 80,
    },
    RiveCoreTypeRow {
        key: 83,
        name: "TransformConstraint",
        parent: 90,
    },
    RiveCoreTypeRow {
        key: 84,
        name: "KeyFrameBool",
        parent: 170,
    },
    RiveCoreTypeRow {
        key: 85,
        name: "TransformComponentConstraint",
        parent: 90,
    },
    RiveCoreTypeRow {
        key: 86,
        name: "TransformComponentConstraintY",
        parent: 85,
    },
    RiveCoreTypeRow {
        key: 87,
        name: "TranslationConstraint",
        parent: 86,
    },
    RiveCoreTypeRow {
        key: 88,
        name: "ScaleConstraint",
        parent: 86,
    },
    RiveCoreTypeRow {
        key: 89,
        name: "RotationConstraint",
        parent: 85,
    },
    RiveCoreTypeRow {
        key: 90,
        name: "TransformSpaceConstraint",
        parent: 80,
    },
    RiveCoreTypeRow {
        key: 91,
        name: "WorldTransformComponent",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 92,
        name: "NestedArtboard",
        parent: 13,
    },
    RiveCoreTypeRow {
        key: 93,
        name: "NestedAnimation",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 95,
        name: "NestedStateMachine",
        parent: 93,
    },
    RiveCoreTypeRow {
        key: 96,
        name: "NestedSimpleAnimation",
        parent: 97,
    },
    RiveCoreTypeRow {
        key: 97,
        name: "NestedLinearAnimation",
        parent: 93,
    },
    RiveCoreTypeRow {
        key: 98,
        name: "NestedRemapAnimation",
        parent: 97,
    },
    RiveCoreTypeRow {
        key: 99,
        name: "Asset",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 100,
        name: "Image",
        parent: 13,
    },
    RiveCoreTypeRow {
        key: 102,
        name: "Folder",
        parent: 99,
    },
    RiveCoreTypeRow {
        key: 103,
        name: "FileAsset",
        parent: 99,
    },
    RiveCoreTypeRow {
        key: 104,
        name: "DrawableAsset",
        parent: 103,
    },
    RiveCoreTypeRow {
        key: 105,
        name: "ImageAsset",
        parent: 104,
    },
    RiveCoreTypeRow {
        key: 106,
        name: "FileAssetContents",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 107,
        name: "Vertex",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 108,
        name: "MeshVertex",
        parent: 107,
    },
    RiveCoreTypeRow {
        key: 109,
        name: "Mesh",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 111,
        name: "ContourMeshVertex",
        parent: 108,
    },
    RiveCoreTypeRow {
        key: 112,
        name: "ForcedEdge",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 114,
        name: "StateMachineListenerSingle",
        parent: 654,
    },
    RiveCoreTypeRow {
        key: 115,
        name: "ListenerTriggerChange",
        parent: 116,
    },
    RiveCoreTypeRow {
        key: 116,
        name: "ListenerInputChange",
        parent: 125,
    },
    RiveCoreTypeRow {
        key: 117,
        name: "ListenerBoolChange",
        parent: 116,
    },
    RiveCoreTypeRow {
        key: 118,
        name: "ListenerNumberChange",
        parent: 116,
    },
    RiveCoreTypeRow {
        key: 119,
        name: "LayeredAsset",
        parent: 104,
    },
    RiveCoreTypeRow {
        key: 120,
        name: "LayerImageAsset",
        parent: 105,
    },
    RiveCoreTypeRow {
        key: 121,
        name: "NestedInput",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 122,
        name: "NestedTrigger",
        parent: 121,
    },
    RiveCoreTypeRow {
        key: 123,
        name: "NestedBool",
        parent: 121,
    },
    RiveCoreTypeRow {
        key: 124,
        name: "NestedNumber",
        parent: 121,
    },
    RiveCoreTypeRow {
        key: 125,
        name: "ListenerAction",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 126,
        name: "ListenerAlignTarget",
        parent: 125,
    },
    RiveCoreTypeRow {
        key: 127,
        name: "CustomPropertyNumber",
        parent: 167,
    },
    RiveCoreTypeRow {
        key: 128,
        name: "Event",
        parent: 548,
    },
    RiveCoreTypeRow {
        key: 129,
        name: "CustomPropertyBoolean",
        parent: 167,
    },
    RiveCoreTypeRow {
        key: 130,
        name: "CustomPropertyString",
        parent: 167,
    },
    RiveCoreTypeRow {
        key: 131,
        name: "OpenUrlEvent",
        parent: 128,
    },
    RiveCoreTypeRow {
        key: 132,
        name: "SVGAsset",
        parent: 104,
    },
    RiveCoreTypeRow {
        key: 133,
        name: "LottieAsset",
        parent: 104,
    },
    RiveCoreTypeRow {
        key: 134,
        name: "Text",
        parent: 13,
    },
    RiveCoreTypeRow {
        key: 135,
        name: "TextValueRun",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 137,
        name: "TextStylePaint",
        parent: 573,
    },
    RiveCoreTypeRow {
        key: 138,
        name: "CubicValueInterpolator",
        parent: 139,
    },
    RiveCoreTypeRow {
        key: 139,
        name: "CubicInterpolator",
        parent: 175,
    },
    RiveCoreTypeRow {
        key: 140,
        name: "Guide",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 141,
        name: "FontAsset",
        parent: 103,
    },
    RiveCoreTypeRow {
        key: 142,
        name: "KeyFrameString",
        parent: 170,
    },
    RiveCoreTypeRow {
        key: 143,
        name: "AnimationFolder",
        parent: 27,
    },
    RiveCoreTypeRow {
        key: 144,
        name: "TextStyleAxis",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 145,
        name: "AdvanceableState",
        parent: 60,
    },
    RiveCoreTypeRow {
        key: 146,
        name: "ClipboardHeader",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 147,
        name: "Solo",
        parent: 2,
    },
    RiveCoreTypeRow {
        key: 148,
        name: "Joystick",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 149,
        name: "StateMachineInputFolder",
        parent: 151,
    },
    RiveCoreTypeRow {
        key: 150,
        name: "StateMachineListenerFolder",
        parent: 151,
    },
    RiveCoreTypeRow {
        key: 151,
        name: "StateMachineComponentFolder",
        parent: 54,
    },
    RiveCoreTypeRow {
        key: 158,
        name: "TextModifierRange",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 159,
        name: "TextModifierGroup",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 160,
        name: "TextModifier",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 161,
        name: "TextShapeModifier",
        parent: 160,
    },
    RiveCoreTypeRow {
        key: 162,
        name: "TextVariationModifier",
        parent: 161,
    },
    RiveCoreTypeRow {
        key: 163,
        name: "CubicInterpolatorComponent",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 164,
        name: "TextStyleFeature",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 165,
        name: "FollowPathConstraint",
        parent: 90,
    },
    RiveCoreTypeRow {
        key: 166,
        name: "Tag",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 167,
        name: "CustomProperty",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 168,
        name: "ListenerFireEvent",
        parent: 125,
    },
    RiveCoreTypeRow {
        key: 169,
        name: "StateMachineFireEvent",
        parent: 615,
    },
    RiveCoreTypeRow {
        key: 170,
        name: "InterpolatingKeyFrame",
        parent: 29,
    },
    RiveCoreTypeRow {
        key: 171,
        name: "KeyFrameCallback",
        parent: 29,
    },
    RiveCoreTypeRow {
        key: 172,
        name: "StateMachineComponentNestedArtboard",
        parent: 151,
    },
    RiveCoreTypeRow {
        key: 173,
        name: "StateMachineNestedInput",
        parent: 54,
    },
    RiveCoreTypeRow {
        key: 174,
        name: "ElasticInterpolator",
        parent: 175,
    },
    RiveCoreTypeRow {
        key: 175,
        name: "KeyFrameInterpolator",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 406,
        name: "AudioAsset",
        parent: 422,
    },
    RiveCoreTypeRow {
        key: 407,
        name: "AudioEvent",
        parent: 128,
    },
    RiveCoreTypeRow {
        key: 409,
        name: "LayoutComponent",
        parent: 13,
    },
    RiveCoreTypeRow {
        key: 420,
        name: "LayoutComponentStyle",
        parent: 1056,
    },
    RiveCoreTypeRow {
        key: 422,
        name: "ExportAudio",
        parent: 103,
    },
    RiveCoreTypeRow {
        key: 426,
        name: "ViewModelInstanceColor",
        parent: 428,
    },
    RiveCoreTypeRow {
        key: 427,
        name: "ViewModelInstanceListItem",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 428,
        name: "ViewModelInstanceValue",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 429,
        name: "ViewModelComponent",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 430,
        name: "ViewModelProperty",
        parent: 429,
    },
    RiveCoreTypeRow {
        key: 431,
        name: "ViewModelPropertyNumber",
        parent: 430,
    },
    RiveCoreTypeRow {
        key: 432,
        name: "ViewModelInstanceEnum",
        parent: 428,
    },
    RiveCoreTypeRow {
        key: 433,
        name: "ViewModelInstanceString",
        parent: 428,
    },
    RiveCoreTypeRow {
        key: 434,
        name: "ViewModelPropertyList",
        parent: 430,
    },
    RiveCoreTypeRow {
        key: 435,
        name: "ViewModel",
        parent: 429,
    },
    RiveCoreTypeRow {
        key: 436,
        name: "ViewModelPropertyViewModel",
        parent: 430,
    },
    RiveCoreTypeRow {
        key: 437,
        name: "ViewModelInstance",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 438,
        name: "DataEnumCustom",
        parent: 510,
    },
    RiveCoreTypeRow {
        key: 439,
        name: "ViewModelPropertyEnumCustom",
        parent: 509,
    },
    RiveCoreTypeRow {
        key: 440,
        name: "ViewModelPropertyColor",
        parent: 430,
    },
    RiveCoreTypeRow {
        key: 441,
        name: "ViewModelInstanceList",
        parent: 428,
    },
    RiveCoreTypeRow {
        key: 442,
        name: "ViewModelInstanceNumber",
        parent: 428,
    },
    RiveCoreTypeRow {
        key: 443,
        name: "ViewModelPropertyString",
        parent: 430,
    },
    RiveCoreTypeRow {
        key: 444,
        name: "ViewModelInstanceViewModel",
        parent: 428,
    },
    RiveCoreTypeRow {
        key: 445,
        name: "DataEnumValue",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 446,
        name: "DataBind",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 447,
        name: "DataBindContext",
        parent: 446,
    },
    RiveCoreTypeRow {
        key: 448,
        name: "ViewModelPropertyBoolean",
        parent: 430,
    },
    RiveCoreTypeRow {
        key: 449,
        name: "ViewModelInstanceBoolean",
        parent: 428,
    },
    RiveCoreTypeRow {
        key: 450,
        name: "KeyFrameUint",
        parent: 170,
    },
    RiveCoreTypeRow {
        key: 451,
        name: "NestedArtboardLeaf",
        parent: 92,
    },
    RiveCoreTypeRow {
        key: 452,
        name: "NestedArtboardLayout",
        parent: 92,
    },
    RiveCoreTypeRow {
        key: 471,
        name: "BindablePropertyString",
        parent: 9,
    },
    RiveCoreTypeRow {
        key: 472,
        name: "BindablePropertyBoolean",
        parent: 9,
    },
    RiveCoreTypeRow {
        key: 473,
        name: "BindablePropertyNumber",
        parent: 9,
    },
    RiveCoreTypeRow {
        key: 474,
        name: "BindablePropertyEnum",
        parent: 9,
    },
    RiveCoreTypeRow {
        key: 475,
        name: "BindablePropertyColor",
        parent: 9,
    },
    RiveCoreTypeRow {
        key: 476,
        name: "TransitionCondition",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 477,
        name: "TransitionComparator",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 478,
        name: "TransitionPropertyComparator",
        parent: 477,
    },
    RiveCoreTypeRow {
        key: 479,
        name: "TransitionPropertyViewModelComparator",
        parent: 478,
    },
    RiveCoreTypeRow {
        key: 480,
        name: "TransitionValueComparator",
        parent: 477,
    },
    RiveCoreTypeRow {
        key: 481,
        name: "TransitionValueBooleanComparator",
        parent: 480,
    },
    RiveCoreTypeRow {
        key: 482,
        name: "TransitionViewModelCondition",
        parent: 476,
    },
    RiveCoreTypeRow {
        key: 483,
        name: "TransitionValueColorComparator",
        parent: 480,
    },
    RiveCoreTypeRow {
        key: 484,
        name: "TransitionValueNumberComparator",
        parent: 480,
    },
    RiveCoreTypeRow {
        key: 485,
        name: "TransitionValueEnumComparator",
        parent: 601,
    },
    RiveCoreTypeRow {
        key: 486,
        name: "TransitionValueStringComparator",
        parent: 480,
    },
    RiveCoreTypeRow {
        key: 487,
        name: "ListenerViewModelChange",
        parent: 125,
    },
    RiveCoreTypeRow {
        key: 488,
        name: "DataConverter",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 489,
        name: "DataConverterRounder",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 490,
        name: "DataConverterToString",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 491,
        name: "NSlicerTileMode",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 492,
        name: "Axis",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 493,
        name: "NSlicer",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 494,
        name: "AxisY",
        parent: 492,
    },
    RiveCoreTypeRow {
        key: 495,
        name: "AxisX",
        parent: 492,
    },
    RiveCoreTypeRow {
        key: 496,
        name: "TransitionPropertyArtboardComparator",
        parent: 478,
    },
    RiveCoreTypeRow {
        key: 497,
        name: "TransitionArtboardCondition",
        parent: 482,
    },
    RiveCoreTypeRow {
        key: 498,
        name: "DataConverterGroupItem",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 499,
        name: "DataConverterGroup",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 500,
        name: "DataConverterOperationValue",
        parent: 516,
    },
    RiveCoreTypeRow {
        key: 501,
        name: "ViewModelInstanceTrigger",
        parent: 428,
    },
    RiveCoreTypeRow {
        key: 502,
        name: "ViewModelPropertyTrigger",
        parent: 430,
    },
    RiveCoreTypeRow {
        key: 503,
        name: "BindablePropertyTrigger",
        parent: 567,
    },
    RiveCoreTypeRow {
        key: 504,
        name: "DataConverterTrigger",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 505,
        name: "TransitionValueTriggerComparator",
        parent: 480,
    },
    RiveCoreTypeRow {
        key: 506,
        name: "DashPath",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 507,
        name: "Dash",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 508,
        name: "NSlicedNode",
        parent: 2,
    },
    RiveCoreTypeRow {
        key: 509,
        name: "ViewModelPropertyEnum",
        parent: 430,
    },
    RiveCoreTypeRow {
        key: 510,
        name: "DataEnum",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 511,
        name: "ViewModelPropertyEnumSystem",
        parent: 509,
    },
    RiveCoreTypeRow {
        key: 512,
        name: "DataEnumSystem",
        parent: 510,
    },
    RiveCoreTypeRow {
        key: 513,
        name: "ForegroundLayoutDrawable",
        parent: 13,
    },
    RiveCoreTypeRow {
        key: 514,
        name: "DataConverterSystemDegsToRads",
        parent: 500,
    },
    RiveCoreTypeRow {
        key: 515,
        name: "DataConverterSystemNormalizer",
        parent: 500,
    },
    RiveCoreTypeRow {
        key: 516,
        name: "DataConverterOperation",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 517,
        name: "DataConverterOperationViewModel",
        parent: 516,
    },
    RiveCoreTypeRow {
        key: 519,
        name: "DataConverterRangeMapper",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 520,
        name: "DraggableConstraint",
        parent: 79,
    },
    RiveCoreTypeRow {
        key: 521,
        name: "ScrollConstraint",
        parent: 520,
    },
    RiveCoreTypeRow {
        key: 522,
        name: "ScrollBarConstraint",
        parent: 520,
    },
    RiveCoreTypeRow {
        key: 523,
        name: "ScrollPhysics",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 524,
        name: "ClampedScrollPhysics",
        parent: 523,
    },
    RiveCoreTypeRow {
        key: 525,
        name: "ElasticScrollPhysics",
        parent: 523,
    },
    RiveCoreTypeRow {
        key: 527,
        name: "BlendState1D",
        parent: 72,
    },
    RiveCoreTypeRow {
        key: 528,
        name: "BlendState1DViewModel",
        parent: 527,
    },
    RiveCoreTypeRow {
        key: 529,
        name: "ScriptAsset",
        parent: 971,
    },
    RiveCoreTypeRow {
        key: 530,
        name: "DataConverterStringPad",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 531,
        name: "DataConverterStringRemoveZeros",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 532,
        name: "DataConverterStringTrim",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 533,
        name: "Feather",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 534,
        name: "DataConverterInterpolator",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 535,
        name: "DataConverterBooleanNegate",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 536,
        name: "DataConverterFormula",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 537,
        name: "FormulaToken",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 538,
        name: "FormulaTokenArgumentSeparator",
        parent: 537,
    },
    RiveCoreTypeRow {
        key: 539,
        name: "FormulaTokenParenthesis",
        parent: 537,
    },
    RiveCoreTypeRow {
        key: 540,
        name: "FormulaTokenParenthesisClose",
        parent: 539,
    },
    RiveCoreTypeRow {
        key: 541,
        name: "FormulaTokenOperation",
        parent: 537,
    },
    RiveCoreTypeRow {
        key: 542,
        name: "FormulaTokenFunction",
        parent: 539,
    },
    RiveCoreTypeRow {
        key: 543,
        name: "FormulaTokenValue",
        parent: 537,
    },
    RiveCoreTypeRow {
        key: 544,
        name: "FormulaTokenParenthesisOpen",
        parent: 539,
    },
    RiveCoreTypeRow {
        key: 545,
        name: "FormulaTokenInput",
        parent: 537,
    },
    RiveCoreTypeRow {
        key: 546,
        name: "TextTargetModifier",
        parent: 160,
    },
    RiveCoreTypeRow {
        key: 547,
        name: "TextFollowPathModifier",
        parent: 546,
    },
    RiveCoreTypeRow {
        key: 548,
        name: "CustomPropertyGroup",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 550,
        name: "LinearAnimationResolver",
        parent: 27,
    },
    RiveCoreTypeRow {
        key: 551,
        name: "StateMachineResolver",
        parent: 27,
    },
    RiveCoreTypeRow {
        key: 558,
        name: "LibraryAsset",
        parent: 103,
    },
    RiveCoreTypeRow {
        key: 559,
        name: "ArtboardComponentList",
        parent: 13,
    },
    RiveCoreTypeRow {
        key: 563,
        name: "ViewModelPropertySymbol",
        parent: 430,
    },
    RiveCoreTypeRow {
        key: 564,
        name: "ViewModelPropertySymbolListIndex",
        parent: 563,
    },
    RiveCoreTypeRow {
        key: 565,
        name: "ViewModelInstanceSymbol",
        parent: 428,
    },
    RiveCoreTypeRow {
        key: 566,
        name: "ViewModelInstanceSymbolListIndex",
        parent: 565,
    },
    RiveCoreTypeRow {
        key: 567,
        name: "BindablePropertyInteger",
        parent: 9,
    },
    RiveCoreTypeRow {
        key: 568,
        name: "DataConverterNumberToList",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 569,
        name: "TextInput",
        parent: 13,
    },
    RiveCoreTypeRow {
        key: 570,
        name: "TextInputDrawable",
        parent: 13,
    },
    RiveCoreTypeRow {
        key: 571,
        name: "TextInputCursor",
        parent: 570,
    },
    RiveCoreTypeRow {
        key: 572,
        name: "TextInputText",
        parent: 570,
    },
    RiveCoreTypeRow {
        key: 573,
        name: "TextStyle",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 574,
        name: "TextInputSelection",
        parent: 570,
    },
    RiveCoreTypeRow {
        key: 575,
        name: "TextInputSelectedText",
        parent: 570,
    },
    RiveCoreTypeRow {
        key: 584,
        name: "ViewModelPropertyAsset",
        parent: 430,
    },
    RiveCoreTypeRow {
        key: 585,
        name: "ViewModelPropertyAssetImage",
        parent: 584,
    },
    RiveCoreTypeRow {
        key: 586,
        name: "ViewModelInstanceAsset",
        parent: 428,
    },
    RiveCoreTypeRow {
        key: 587,
        name: "ViewModelInstanceAssetImage",
        parent: 586,
    },
    RiveCoreTypeRow {
        key: 588,
        name: "BindablePropertyAsset",
        parent: 596,
    },
    RiveCoreTypeRow {
        key: 590,
        name: "BindablePropertyList",
        parent: 9,
    },
    RiveCoreTypeRow {
        key: 591,
        name: "DataConverterListToLength",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 592,
        name: "CustomPropertyColor",
        parent: 167,
    },
    RiveCoreTypeRow {
        key: 593,
        name: "TransitionSelfComparator",
        parent: 477,
    },
    RiveCoreTypeRow {
        key: 596,
        name: "BindablePropertyId",
        parent: 9,
    },
    RiveCoreTypeRow {
        key: 597,
        name: "BindablePropertyArtboard",
        parent: 596,
    },
    RiveCoreTypeRow {
        key: 598,
        name: "ViewModelPropertyArtboard",
        parent: 430,
    },
    RiveCoreTypeRow {
        key: 599,
        name: "ViewModelInstanceArtboard",
        parent: 428,
    },
    RiveCoreTypeRow {
        key: 601,
        name: "TransitionValueIdComparator",
        parent: 480,
    },
    RiveCoreTypeRow {
        key: 602,
        name: "TransitionValueAssetComparator",
        parent: 601,
    },
    RiveCoreTypeRow {
        key: 603,
        name: "ScriptedDrawable",
        parent: 13,
    },
    RiveCoreTypeRow {
        key: 606,
        name: "ArtboardComponentListOverride",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 611,
        name: "ScriptInputNumber",
        parent: 127,
    },
    RiveCoreTypeRow {
        key: 612,
        name: "ScriptInputViewModelProperty",
        parent: 167,
    },
    RiveCoreTypeRow {
        key: 613,
        name: "CustomPropertyTrigger",
        parent: 167,
    },
    RiveCoreTypeRow {
        key: 614,
        name: "StateMachineFireTrigger",
        parent: 615,
    },
    RiveCoreTypeRow {
        key: 615,
        name: "StateMachineFireAction",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 616,
        name: "CustomPropertyEnum",
        parent: 167,
    },
    RiveCoreTypeRow {
        key: 617,
        name: "DataConverterToNumber",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 618,
        name: "ScriptInputTrigger",
        parent: 613,
    },
    RiveCoreTypeRow {
        key: 619,
        name: "ListPath",
        parent: 620,
    },
    RiveCoreTypeRow {
        key: 620,
        name: "PointsCommonPath",
        parent: 12,
    },
    RiveCoreTypeRow {
        key: 621,
        name: "ScriptInputArtboard",
        parent: 167,
    },
    RiveCoreTypeRow {
        key: 625,
        name: "ListFollowPathConstraint",
        parent: 165,
    },
    RiveCoreTypeRow {
        key: 626,
        name: "ScriptInputColor",
        parent: 592,
    },
    RiveCoreTypeRow {
        key: 627,
        name: "ScriptInputString",
        parent: 130,
    },
    RiveCoreTypeRow {
        key: 629,
        name: "ScriptedDataConverter",
        parent: 488,
    },
    RiveCoreTypeRow {
        key: 630,
        name: "TransitionValueArtboardComparator",
        parent: 601,
    },
    RiveCoreTypeRow {
        key: 631,
        name: "ScriptInputBoolean",
        parent: 129,
    },
    RiveCoreTypeRow {
        key: 637,
        name: "ScriptedLayout",
        parent: 603,
    },
    RiveCoreTypeRow {
        key: 640,
        name: "ScriptedPathEffect",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 642,
        name: "ManifestAsset",
        parent: 103,
    },
    RiveCoreTypeRow {
        key: 643,
        name: "DataBindPath",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 644,
        name: "TargetEffect",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 645,
        name: "GroupEffect",
        parent: 11,
    },
    RiveCoreTypeRow {
        key: 646,
        name: "ScriptedListenerAction",
        parent: 125,
    },
    RiveCoreTypeRow {
        key: 647,
        name: "ScriptedTransitionCondition",
        parent: 476,
    },
    RiveCoreTypeRow {
        key: 648,
        name: "ArtboardListMapRule",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 649,
        name: "BlobAsset",
        parent: 103,
    },
    RiveCoreTypeRow {
        key: 651,
        name: "ProfilerAsset",
        parent: 103,
    },
    RiveCoreTypeRow {
        key: 652,
        name: "FocusActionTarget",
        parent: 671,
    },
    RiveCoreTypeRow {
        key: 653,
        name: "FocusData",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 654,
        name: "StateMachineListener",
        parent: 54,
    },
    RiveCoreTypeRow {
        key: 658,
        name: "ListenerInputType",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 659,
        name: "ListenerInputTypeEvent",
        parent: 658,
    },
    RiveCoreTypeRow {
        key: 660,
        name: "ListenerInputTypeViewModel",
        parent: 658,
    },
    RiveCoreTypeRow {
        key: 662,
        name: "BindablePropertyViewModel",
        parent: 596,
    },
    RiveCoreTypeRow {
        key: 663,
        name: "UserInput",
        parent: -1,
    },
    RiveCoreTypeRow {
        key: 664,
        name: "KeyboardInput",
        parent: 663,
    },
    RiveCoreTypeRow {
        key: 665,
        name: "ListenerInputTypeKeyboard",
        parent: 658,
    },
    RiveCoreTypeRow {
        key: 666,
        name: "ListenerInputTypeText",
        parent: 658,
    },
    RiveCoreTypeRow {
        key: 667,
        name: "TransitionPropertyComponentComparator",
        parent: 478,
    },
    RiveCoreTypeRow {
        key: 668,
        name: "SemanticData",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 669,
        name: "ListenerInputTypeSemantic",
        parent: 658,
    },
    RiveCoreTypeRow {
        key: 670,
        name: "SemanticInput",
        parent: 663,
    },
    RiveCoreTypeRow {
        key: 671,
        name: "FocusAction",
        parent: 125,
    },
    RiveCoreTypeRow {
        key: 672,
        name: "FocusActionTraversal",
        parent: 671,
    },
    RiveCoreTypeRow {
        key: 970,
        name: "ShaderAsset",
        parent: 971,
    },
    RiveCoreTypeRow {
        key: 971,
        name: "TextAsset",
        parent: 103,
    },
    RiveCoreTypeRow {
        key: 972,
        name: "ScriptedInterpolator",
        parent: 175,
    },
    RiveCoreTypeRow {
        key: 973,
        name: "ListenerInputTypeGamepad",
        parent: 658,
    },
    RiveCoreTypeRow {
        key: 974,
        name: "GamepadInput",
        parent: 663,
    },
    RiveCoreTypeRow {
        key: 1034,
        name: "ViewModelPropertyAssetFont",
        parent: 584,
    },
    RiveCoreTypeRow {
        key: 1035,
        name: "ViewModelInstanceAssetFont",
        parent: 586,
    },
    RiveCoreTypeRow {
        key: 1037,
        name: "FocusActionClear",
        parent: 671,
    },
    RiveCoreTypeRow {
        key: 1038,
        name: "TransitionFocusCondition",
        parent: 482,
    },
    RiveCoreTypeRow {
        key: 1039,
        name: "ComponentOrigin",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 1042,
        name: "TextBlobAsset",
        parent: 971,
    },
    RiveCoreTypeRow {
        key: 1043,
        name: "ViewModelPropertyAssetBlob",
        parent: 584,
    },
    RiveCoreTypeRow {
        key: 1044,
        name: "ViewModelInstanceAssetBlob",
        parent: 586,
    },
    RiveCoreTypeRow {
        key: 1056,
        name: "LayoutSizingStyle",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 1057,
        name: "LayoutNodeStyle",
        parent: 1056,
    },
    RiveCoreTypeRow {
        key: 1058,
        name: "GridTrack",
        parent: 10,
    },
    RiveCoreTypeRow {
        key: 1066,
        name: "LayoutParticipant",
        parent: 1057,
    },
    RiveCoreTypeRow {
        key: 1067,
        name: "KeyFrameInt",
        parent: 170,
    },
    RiveCoreTypeRow {
        key: 1068,
        name: "GridItemPlacement",
        parent: 10,
    },
];
