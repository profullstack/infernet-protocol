-- Per-chapter HTML build: rewrite `.md` link targets to `.html` so
-- cross-chapter references resolve to the sibling html files.
-- Used when each chapter is rendered to its own .html file (one-to-one).
--
-- Examples:
--   [Setup](setup.md)                 → [Setup](setup.html)
--   [Setup](setup.md#advanced)        → [Setup](setup.html#advanced)
--   [Ops](../02-node-operators/index.md) → [Ops](../02-node-operators/index.html)
--
-- External links (https://, mailto:) are left untouched.

function Link(el)
    if not el.target then return el end
    if el.target:match("^https?://") then return el end
    if el.target:match("^mailto:") then return el end
    el.target = el.target:gsub("%.md(#?[^/]*)$", ".html%1")
    return el
end
