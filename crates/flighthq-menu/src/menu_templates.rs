//! Menu template tree manipulation utilities.

use flighthq_types::{MenuItemTemplate, MenuItemType};

/// Appends a separator item to the list.
pub fn append_menu_item_separator(items: &mut Vec<MenuItemTemplate>) {
    items.push(MenuItemTemplate {
        item_type: MenuItemType::Separator,
        enabled: true,
        ..Default::default()
    });
}

/// Appends clones of all items to the target list.
pub fn append_menu_items(target: &mut Vec<MenuItemTemplate>, items: &[MenuItemTemplate]) {
    target.extend_from_slice(items);
}

/// Creates and appends a submenu item with the given label and children.
/// Returns a mutable reference to the newly appended item.
pub fn append_submenu_item<'a>(
    items: &'a mut Vec<MenuItemTemplate>,
    label: &str,
    submenu: Vec<MenuItemTemplate>,
) -> &'a mut MenuItemTemplate {
    items.push(MenuItemTemplate {
        label: Some(label.to_string()),
        item_type: MenuItemType::Submenu,
        enabled: true,
        submenu,
        ..Default::default()
    });
    items.last_mut().unwrap()
}

/// Deep-clones a `MenuItemTemplate` tree, recursively cloning submenu children.
pub fn create_menu_item_from_template(template: &MenuItemTemplate) -> MenuItemTemplate {
    MenuItemTemplate {
        id: template.id.clone(),
        label: template.label.clone(),
        item_type: template.item_type,
        role: template.role,
        accelerator: template.accelerator.clone(),
        enabled: template.enabled,
        checked: template.checked,
        submenu: template
            .submenu
            .iter()
            .map(create_menu_item_from_template)
            .collect(),
    }
}

/// Creates an empty menu template list.
pub fn create_menu_template() -> Vec<MenuItemTemplate> {
    Vec::new()
}

/// Finds a menu item by id recursively through the tree. Returns `None` if not
/// found.
pub fn get_menu_item_by_id<'a>(
    items: &'a [MenuItemTemplate],
    id: &str,
) -> Option<&'a MenuItemTemplate> {
    for item in items {
        if item.id.as_deref() == Some(id) {
            return Some(item);
        }
        if let Some(found) = get_menu_item_by_id(&item.submenu, id) {
            return Some(found);
        }
    }
    None
}

/// Inserts an item at the given index. Returns `false` if the index is out of
/// bounds (greater than `items.len()`).
pub fn insert_menu_item_at(
    items: &mut Vec<MenuItemTemplate>,
    index: usize,
    item: MenuItemTemplate,
) -> bool {
    if index > items.len() {
        return false;
    }
    items.insert(index, item);
    true
}

/// Finds the item with `before_id` and inserts new items before it (top-level
/// search only). Returns `false` if `before_id` is not found.
pub fn insert_menu_items_before(
    items: &mut Vec<MenuItemTemplate>,
    before_id: &str,
    new_items: &[MenuItemTemplate],
) -> bool {
    let pos = items
        .iter()
        .position(|item| item.id.as_deref() == Some(before_id));
    match pos {
        Some(index) => {
            for (offset, new_item) in new_items.iter().enumerate() {
                items.insert(index + offset, new_item.clone());
            }
            true
        }
        None => false,
    }
}

/// Clears all items from the list.
pub fn remove_all_menu_items(items: &mut Vec<MenuItemTemplate>) {
    items.clear();
}

/// Removes the first item matching the given id (top-level search). Returns
/// `false` if not found.
pub fn remove_menu_item_by_id(items: &mut Vec<MenuItemTemplate>, id: &str) -> bool {
    let pos = items.iter().position(|item| item.id.as_deref() == Some(id));
    match pos {
        Some(index) => {
            items.remove(index);
            true
        }
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_item(id: &str, label: &str) -> MenuItemTemplate {
        MenuItemTemplate {
            id: Some(id.to_string()),
            label: Some(label.to_string()),
            enabled: true,
            ..Default::default()
        }
    }

    // append_menu_item_separator
    #[test]
    fn append_menu_item_separator_adds_separator() {
        let mut items = Vec::new();
        append_menu_item_separator(&mut items);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].item_type, MenuItemType::Separator);
        assert!(items[0].enabled);
    }

    // append_menu_items
    #[test]
    fn append_menu_items_clones_all() {
        let mut target = vec![make_item("a", "A")];
        let source = vec![make_item("b", "B"), make_item("c", "C")];
        append_menu_items(&mut target, &source);
        assert_eq!(target.len(), 3);
        assert_eq!(target[1].id.as_deref(), Some("b"));
        assert_eq!(target[2].id.as_deref(), Some("c"));
    }

    // append_submenu_item
    #[test]
    fn append_submenu_item_creates_submenu() {
        let mut items = Vec::new();
        let children = vec![make_item("child", "Child")];
        let sub = append_submenu_item(&mut items, "File", children);
        assert_eq!(sub.label.as_deref(), Some("File"));
        assert_eq!(sub.item_type, MenuItemType::Submenu);
        assert!(sub.enabled);
        assert_eq!(sub.submenu.len(), 1);
        assert_eq!(sub.submenu[0].id.as_deref(), Some("child"));
    }

    // create_menu_item_from_template
    #[test]
    fn create_menu_item_from_template_deep_clones() {
        let template = MenuItemTemplate {
            id: Some("root".to_string()),
            label: Some("Root".to_string()),
            enabled: true,
            submenu: vec![MenuItemTemplate {
                id: Some("child".to_string()),
                label: Some("Child".to_string()),
                enabled: true,
                submenu: vec![make_item("grandchild", "Grandchild")],
                ..Default::default()
            }],
            ..Default::default()
        };
        let cloned = create_menu_item_from_template(&template);
        assert_eq!(cloned.id.as_deref(), Some("root"));
        assert_eq!(cloned.submenu.len(), 1);
        assert_eq!(cloned.submenu[0].id.as_deref(), Some("child"));
        assert_eq!(cloned.submenu[0].submenu.len(), 1);
        assert_eq!(
            cloned.submenu[0].submenu[0].id.as_deref(),
            Some("grandchild")
        );
    }

    // create_menu_template
    #[test]
    fn create_menu_template_returns_empty() {
        let items = create_menu_template();
        assert!(items.is_empty());
    }

    // get_menu_item_by_id
    #[test]
    fn get_menu_item_by_id_finds_top_level() {
        let items = vec![make_item("a", "A"), make_item("b", "B")];
        let found = get_menu_item_by_id(&items, "b");
        assert!(found.is_some());
        assert_eq!(found.unwrap().label.as_deref(), Some("B"));
    }

    #[test]
    fn get_menu_item_by_id_finds_nested() {
        let items = vec![MenuItemTemplate {
            id: Some("parent".to_string()),
            submenu: vec![make_item("nested", "Nested")],
            ..Default::default()
        }];
        let found = get_menu_item_by_id(&items, "nested");
        assert!(found.is_some());
        assert_eq!(found.unwrap().label.as_deref(), Some("Nested"));
    }

    #[test]
    fn get_menu_item_by_id_returns_none_when_missing() {
        let items = vec![make_item("a", "A")];
        assert!(get_menu_item_by_id(&items, "missing").is_none());
    }

    // insert_menu_item_at
    #[test]
    fn insert_menu_item_at_inserts_in_middle() {
        let mut items = vec![make_item("a", "A"), make_item("c", "C")];
        assert!(insert_menu_item_at(&mut items, 1, make_item("b", "B")));
        assert_eq!(items.len(), 3);
        assert_eq!(items[1].id.as_deref(), Some("b"));
    }

    #[test]
    fn insert_menu_item_at_returns_false_out_of_bounds() {
        let mut items = vec![make_item("a", "A")];
        assert!(!insert_menu_item_at(&mut items, 5, make_item("x", "X")));
        assert_eq!(items.len(), 1);
    }

    #[test]
    fn insert_menu_item_at_allows_end() {
        let mut items = vec![make_item("a", "A")];
        assert!(insert_menu_item_at(&mut items, 1, make_item("b", "B")));
        assert_eq!(items.len(), 2);
        assert_eq!(items[1].id.as_deref(), Some("b"));
    }

    // insert_menu_items_before
    #[test]
    fn insert_menu_items_before_inserts_correctly() {
        let mut items = vec![make_item("a", "A"), make_item("c", "C")];
        let new_items = vec![make_item("b1", "B1"), make_item("b2", "B2")];
        assert!(insert_menu_items_before(&mut items, "c", &new_items));
        assert_eq!(items.len(), 4);
        assert_eq!(items[0].id.as_deref(), Some("a"));
        assert_eq!(items[1].id.as_deref(), Some("b1"));
        assert_eq!(items[2].id.as_deref(), Some("b2"));
        assert_eq!(items[3].id.as_deref(), Some("c"));
    }

    #[test]
    fn insert_menu_items_before_returns_false_when_not_found() {
        let mut items = vec![make_item("a", "A")];
        assert!(!insert_menu_items_before(
            &mut items,
            "missing",
            &[make_item("x", "X")]
        ));
        assert_eq!(items.len(), 1);
    }

    // remove_all_menu_items
    #[test]
    fn remove_all_menu_items_clears() {
        let mut items = vec![make_item("a", "A"), make_item("b", "B")];
        remove_all_menu_items(&mut items);
        assert!(items.is_empty());
    }

    // remove_menu_item_by_id
    #[test]
    fn remove_menu_item_by_id_removes_matching() {
        let mut items = vec![
            make_item("a", "A"),
            make_item("b", "B"),
            make_item("c", "C"),
        ];
        assert!(remove_menu_item_by_id(&mut items, "b"));
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id.as_deref(), Some("a"));
        assert_eq!(items[1].id.as_deref(), Some("c"));
    }

    #[test]
    fn remove_menu_item_by_id_returns_false_when_not_found() {
        let mut items = vec![make_item("a", "A")];
        assert!(!remove_menu_item_by_id(&mut items, "missing"));
        assert_eq!(items.len(), 1);
    }
}
