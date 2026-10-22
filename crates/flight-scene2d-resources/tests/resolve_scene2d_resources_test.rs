use std::sync::Arc;

use flight_node::{NodeRef, add_node_child, get_node_parent};
use flight_scene2d::{Node2DRef, create_display_object};
use flight_scene2d_resources::contract::*;

use crate::guard_state;

fn output(document: &flight_entity::Ref<Scene2DDocument>) -> Scene2DResources {
    let root = document.read().unwrap().root.clone();
    return Scene2DResources {
        document: document.clone(),
        resolved: Vec::new(),
        root,
        unresolved: Vec::new(),
    };
}

mod resolve_scene2d_resources {
    use super::*;

    #[test]
    fn clears_stale_managed_content_when_a_selected_reference_is_unresolved() {
        let target = create_display_object(None);
        let stale = create_display_object(None);
        let reference = create_scene2d_slot_reference();
        {
            let mut reference = reference.write().unwrap();
            reference.name = "missing".to_string();
            reference.required = true;
            reference.target = target.clone();
            reference.content = Some(stale.clone());
        }
        let target_node: NodeRef = target;
        let stale_node: NodeRef = stale.clone();
        add_node_child(&target_node, &stale_node);
        let document = create_scene2d_document();
        document.write().unwrap().slots = vec![reference.clone()];
        let mut out = output(&document);
        resolve_scene2d_resources(&mut out, &document, None, &guard_state());
        assert_eq!(out.unresolved.len(), 1);
        assert!(Arc::ptr_eq(&out.unresolved[0], &reference));
        assert!(reference.read().unwrap().content.is_none());
        assert!(get_node_parent(&stale_node).is_none());
    }

    #[test]
    fn leaves_references_outside_the_selected_working_set_untouched() {
        let target = create_display_object(None);
        let existing: Node2DRef = create_display_object(None);
        let reference = create_scene2d_slot_reference();
        {
            let mut reference = reference.write().unwrap();
            reference.content = Some(existing.clone());
            reference.name = "deferred".to_string();
            reference.target = target;
        }
        let document = create_scene2d_document();
        document.write().unwrap().slots = vec![reference.clone()];
        let options = ResolveScene2DResourcesOptions {
            resolve_slot_content: None,
            select: Some(Arc::new(|_| false)),
        };
        let mut out = output(&document);
        resolve_scene2d_resources(&mut out, &document, Some(&options), &guard_state());
        assert!(out.resolved.is_empty());
        assert!(out.unresolved.is_empty());
        assert!(Arc::ptr_eq(
            reference.read().unwrap().content.as_ref().unwrap(),
            &existing
        ));
    }

    #[test]
    fn reconciles_application_slot_content_synchronously() {
        let root = create_display_object(None);
        let target = create_display_object(None);
        let content: Node2DRef = create_display_object(None);
        let reference = create_scene2d_slot_reference();
        {
            let mut reference = reference.write().unwrap();
            reference.linkage = Some("Game.Avatar".to_string());
            reference.name = "avatar".to_string();
            reference.required = true;
            reference.target = target.clone();
        }
        let document = create_scene2d_document();
        {
            let mut document = document.write().unwrap();
            document.root = root;
            document.slots = vec![reference.clone()];
        }
        let chosen: Node2DRef = content.clone();
        let options = ResolveScene2DResourcesOptions {
            resolve_slot_content: Some(Arc::new(move |reference| {
                if reference.name == "avatar" && reference.linkage.as_deref() == Some("Game.Avatar")
                {
                    Some(chosen.clone())
                } else {
                    None
                }
            })),
            select: None,
        };
        let mut out = output(&document);
        resolve_scene2d_resources(&mut out, &document, Some(&options), &guard_state());
        assert_eq!(out.resolved.len(), 1);
        assert!(out.unresolved.is_empty());
        assert!(Arc::ptr_eq(&out.resolved[0].content, &content));
        let content_node: NodeRef = content;
        let target_node: NodeRef = target;
        assert!(Arc::ptr_eq(
            &get_node_parent(&content_node).unwrap(),
            &target_node
        ));
    }
}
