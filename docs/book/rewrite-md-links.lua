-- Rewrite cross-chapter [text](path/to/file.md) links to single-page
-- anchors when the book is concatenated into one HTML file.
--
-- Each chapter's H1 becomes an auto-generated pandoc anchor
-- (lowercased, dashed). For a target like
-- "02-node-operators/installation.md" we point at "#installation".
-- For "02-node-operators/index.md" we strip the leading number from
-- the directory name and use that ("#node-operators").
--
-- Used by .github/workflows/book.yml when building infernet-book.html.

local function basename_no_md(target)
    local name = target:match("([^/]+)%.md")
    if not name then return nil end
    -- index.md → use the parent directory's slug instead
    if name == "index" then
        local dir = target:match("([^/]+)/index%.md")
        if dir then
            -- strip "02-" or "12-" leading numeric prefix
            return (dir:gsub("^%d+%-", ""))
        end
    end
    -- strip a leading numeric prefix from filenames like "01-overview.md"
    return (name:gsub("^%d+%-", ""))
end

function Link(el)
    local target = el.target
    if not target then return el end
    -- skip absolute / external links
    if target:match("^https?://") or target:match("^mailto:") then return el end
    -- only rewrite if it's a .md target
    local slug = basename_no_md(target)
    if not slug then return el end
    el.target = "#" .. slug:lower()
    return el
end
