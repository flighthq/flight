// Action sections use top-level list items as their machine-readable boundary. Explicit closure
// markers keep historical notes readable in an assessment without resurrecting them as work.
export function itemHeadlines(section) {
  const items = [];
  for (const line of section.split('\n')) {
    const listItem = line.match(/^(?:\d+\.|-)\s+(.*)$/);
    if (!listItem) continue;
    const body = listItem[1];
    if (isClosedItem(body)) continue;
    const bold = body.match(/^\*\*(.+?)\*\*/);
    let headline = bold ? bold[1] : (body.match(/^(.+?[.!?])(\s|$)/)?.[1] ?? body);
    headline = headline.replace(/[.:]\s*$/, '').trim();
    if (headline.length > 140) headline = `${headline.slice(0, 137)}…`;
    items.push(headline);
  }
  return items;
}

function isClosedItem(body) {
  if (/^(?:\*\*|__)?~~/.test(body)) return true;
  if (/^\*\*\[[^\]]*\b(?:closed|completed|landed|resolved|retired)\b[^\]]*\]/i.test(body)) return true;
  return /(?:—|--)\s*[*_~]*(?:✅\s*)?(?:already\s+done|closed|completed|done|landed|n\/a|resolved|retired)\b/i.test(
    body,
  );
}
