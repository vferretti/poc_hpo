(function () {
    "use strict";

    // --- State ---
    const state = {
        selectedIds: new Set(),
        loadedChildren: {},   // nodeId -> [childData, ...]
        searchMode: false,
        searchData: null,
        totalCount: 0,
        rootNode: null,
    };

    // Label cache: id -> label (for selection panel even when node not visible)
    const labelCache = new Map();

    // DOM refs
    const treeContainer = document.getElementById("tree-container");
    const leftCount = document.getElementById("left-count");
    const rightCount = document.getElementById("right-count");
    const searchInput = document.getElementById("search-input");
    const searchClear = document.getElementById("search-clear");
    const selectionList = document.getElementById("selection-list");
    const emptyState = document.getElementById("empty-state");

    // --- Helpers ---

    function formatCount(n) {
        return n + " \u00e9l\u00e9ment" + (n > 1 ? "s" : "");
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function highlightText(text, query) {
        const escaped = escapeRegex(query);
        const regex = new RegExp("(" + escaped + ")", "gi");
        return escapeHtml(text).replace(regex, "<mark>$1</mark>");
    }

    // --- API ---

    async function fetchRoots() {
        const resp = await fetch("/api/roots");
        return resp.json();
    }

    async function fetchChildren(nodeId) {
        if (state.loadedChildren[nodeId]) {
            return state.loadedChildren[nodeId];
        }
        const resp = await fetch("/api/children/" + encodeURIComponent(nodeId));
        const data = await resp.json();
        state.loadedChildren[nodeId] = data.children;
        return data.children;
    }

    async function fetchSearch(query) {
        const resp = await fetch("/api/search?q=" + encodeURIComponent(query));
        return resp.json();
    }

    // --- Tree Rendering (Browse Mode) ---

    function createNodeRow(nodeData, searchContext) {
        labelCache.set(nodeData.id, nodeData.label);

        const row = document.createElement("div");
        row.className = "tree-node-row";
        row.dataset.id = nodeData.id;

        // Arrow
        const arrow = document.createElement("span");
        arrow.className = "tree-arrow";
        if (nodeData.is_leaf && nodeData.child_count === 0) {
            arrow.classList.add("leaf");
        } else {
            arrow.textContent = "\u25B6"; // ▶
        }
        row.appendChild(arrow);

        // Checkbox
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "tree-checkbox";
        checkbox.checked = state.selectedIds.has(nodeData.id);
        checkbox.addEventListener("change", function () {
            toggleSelection(nodeData.id);
        });
        row.appendChild(checkbox);

        // Label
        const label = document.createElement("span");
        label.className = "tree-label";
        const displayText = nodeData.label + " (" + nodeData.id + ")";
        if (searchContext && searchContext.matchedIds.has(nodeData.id)) {
            label.innerHTML = highlightText(nodeData.label, searchContext.query) +
                " <span class=\"hp-id\">(" + escapeHtml(nodeData.id) + ")</span>";
        } else {
            label.innerHTML = escapeHtml(nodeData.label) +
                " <span class=\"hp-id\">(" + escapeHtml(nodeData.id) + ")</span>";
        }
        row.appendChild(label);

        return row;
    }

    function createNodeBlock(nodeData, expanded, searchContext) {
        const wrapper = document.createElement("div");
        wrapper.className = "tree-node";
        wrapper.dataset.id = nodeData.id;

        const row = createNodeRow(nodeData, searchContext);
        wrapper.appendChild(row);

        // Children container
        const childrenDiv = document.createElement("div");
        childrenDiv.className = "tree-children" + (expanded ? "" : " hidden");
        childrenDiv.dataset.parentId = nodeData.id;
        wrapper.appendChild(childrenDiv);

        // Arrow click handler
        const arrow = row.querySelector(".tree-arrow");
        if (!arrow.classList.contains("leaf")) {
            arrow.addEventListener("click", function () {
                toggleExpand(nodeData.id, arrow, childrenDiv);
            });
            if (expanded) {
                arrow.classList.add("expanded");
            }
        }

        return wrapper;
    }

    async function toggleExpand(nodeId, arrow, childrenDiv) {
        const isExpanded = arrow.classList.contains("expanded");

        if (isExpanded) {
            // Collapse
            arrow.classList.remove("expanded");
            childrenDiv.classList.add("hidden");
        } else {
            // Expand
            arrow.classList.add("expanded");
            childrenDiv.classList.remove("hidden");

            // Load children if not already loaded
            if (childrenDiv.children.length === 0) {
                const loading = document.createElement("div");
                loading.className = "loading";
                loading.textContent = "Chargement...";
                childrenDiv.appendChild(loading);

                try {
                    const children = await fetchChildren(nodeId);
                    childrenDiv.innerHTML = "";
                    for (const child of children) {
                        const block = createNodeBlock(child, false, null);
                        childrenDiv.appendChild(block);
                    }
                } catch (err) {
                    childrenDiv.innerHTML = "";
                    const errorDiv = document.createElement("div");
                    errorDiv.className = "loading";
                    errorDiv.textContent = "Erreur de chargement";
                    childrenDiv.appendChild(errorDiv);
                }
            }
        }
    }

    // --- Tree Rendering (Search Mode) ---

    function renderSearchTree(data) {
        treeContainer.innerHTML = "";

        const matchedIds = new Set(data.matched_ids);
        const expandedIds = new Set(data.expanded_ids);
        const nodesMap = data.nodes;

        const searchContext = {
            matchedIds: matchedIds,
            expandedIds: expandedIds,
            query: data.query,
            nodesMap: nodesMap,
        };

        // Cache labels
        for (const [nid, ndata] of Object.entries(nodesMap)) {
            labelCache.set(nid, ndata.label);
        }

        // Find the PA root in the result and render from there
        const paRoot = nodesMap["HP:0000118"];
        if (!paRoot) {
            treeContainer.innerHTML = "<div class='loading'>Aucun r\u00e9sultat</div>";
            return;
        }

        const rootDiv = document.createElement("div");
        rootDiv.className = "tree-root";

        // Render the PA root node itself
        const rootBlock = renderSearchNode(paRoot, searchContext);
        rootDiv.appendChild(rootBlock);

        treeContainer.appendChild(rootDiv);

        leftCount.textContent = formatCount(data.match_count);
    }

    function renderSearchNode(nodeData, searchContext) {
        const isExpanded = searchContext.expandedIds.has(nodeData.id);
        const block = createNodeBlock(nodeData, isExpanded, searchContext);

        if (isExpanded) {
            const childrenDiv = block.querySelector(".tree-children");
            // Find children of this node in the result set
            const childIds = [];
            for (const [nid, ndata] of Object.entries(searchContext.nodesMap)) {
                if (ndata.parent_ids && ndata.parent_ids.includes(nodeData.id)) {
                    childIds.push(ndata);
                }
            }
            childIds.sort(function (a, b) {
                return a.label.localeCompare(b.label);
            });

            for (const child of childIds) {
                const childBlock = renderSearchNode(child, searchContext);
                childrenDiv.appendChild(childBlock);
            }
        }

        return block;
    }

    // --- Search ---

    let searchTimeout = null;

    function onSearchInput() {
        const query = searchInput.value.trim();
        searchClear.style.display = query.length > 0 ? "flex" : "none";

        clearTimeout(searchTimeout);

        if (query.length < 3) {
            if (state.searchMode) {
                exitSearchMode();
            }
            return;
        }

        searchTimeout = setTimeout(function () {
            performSearch(query);
        }, 300);
    }

    async function performSearch(query) {
        try {
            const data = await fetchSearch(query);
            state.searchMode = true;
            state.searchData = data;
            renderSearchTree(data);
        } catch (err) {
            console.error("Search error:", err);
        }
    }

    function exitSearchMode() {
        state.searchMode = false;
        state.searchData = null;
        leftCount.textContent = formatCount(state.totalCount);
        renderInitialTree();
    }

    function onSearchClear() {
        searchInput.value = "";
        searchClear.style.display = "none";
        if (state.searchMode) {
            exitSearchMode();
        }
        searchInput.focus();
    }

    // --- Selection ---

    function toggleSelection(id) {
        if (state.selectedIds.has(id)) {
            state.selectedIds.delete(id);
        } else {
            state.selectedIds.add(id);
        }
        updateSelectionPanel();
        syncCheckboxes();
    }

    function removeSelection(id) {
        state.selectedIds.delete(id);
        updateSelectionPanel();
        syncCheckboxes();
    }

    function updateSelectionPanel() {
        const count = state.selectedIds.size;
        rightCount.textContent = formatCount(count);

        if (count === 0) {
            emptyState.style.display = "flex";
            selectionList.innerHTML = "";
            return;
        }

        emptyState.style.display = "none";
        selectionList.innerHTML = "";

        for (const id of state.selectedIds) {
            const li = document.createElement("li");
            li.className = "selection-item";

            const labelSpan = document.createElement("span");
            labelSpan.className = "selection-item-label";
            const lbl = labelCache.get(id) || id;
            labelSpan.innerHTML = escapeHtml(lbl) +
                " <span class=\"hp-id\">(" + escapeHtml(id) + ")</span>";
            li.appendChild(labelSpan);

            const trash = document.createElement("span");
            trash.className = "selection-item-trash";
            trash.textContent = "\uD83D\uDDD1"; // 🗑
            trash.title = "Retirer";
            trash.addEventListener("click", function () {
                removeSelection(id);
            });
            li.appendChild(trash);

            selectionList.appendChild(li);
        }
    }

    function syncCheckboxes() {
        // Sync all visible checkboxes with the selection state
        const checkboxes = treeContainer.querySelectorAll(".tree-checkbox");
        for (const cb of checkboxes) {
            const row = cb.closest(".tree-node-row");
            if (row) {
                cb.checked = state.selectedIds.has(row.dataset.id);
                cb.indeterminate = false;
            }
        }

        // Compute indeterminate states (bottom-up)
        updateIndeterminateStates();
    }

    function updateIndeterminateStates() {
        // Walk through all tree-node elements and compute parent checkbox state
        const allNodeBlocks = treeContainer.querySelectorAll(".tree-node");
        // Process in reverse order (bottom-up) for correct aggregation
        const blocks = Array.from(allNodeBlocks).reverse();

        for (const block of blocks) {
            const row = block.querySelector(":scope > .tree-node-row");
            const childrenDiv = block.querySelector(":scope > .tree-children");
            if (!row || !childrenDiv) continue;

            const childCheckboxes = childrenDiv.querySelectorAll(".tree-checkbox");
            if (childCheckboxes.length === 0) continue;

            const checkbox = row.querySelector(".tree-checkbox");
            if (!checkbox) continue;

            let allChecked = true;
            let anyChecked = false;
            for (const ccb of childCheckboxes) {
                if (ccb.checked || ccb.indeterminate) {
                    anyChecked = true;
                }
                if (!ccb.checked) {
                    allChecked = false;
                }
            }

            if (allChecked && childCheckboxes.length > 0) {
                checkbox.checked = true;
                checkbox.indeterminate = false;
            } else if (anyChecked) {
                checkbox.checked = false;
                checkbox.indeterminate = true;
            } else {
                checkbox.checked = state.selectedIds.has(row.dataset.id);
                checkbox.indeterminate = false;
            }
        }
    }

    // --- Initial Load ---

    async function renderInitialTree() {
        treeContainer.innerHTML = "";
        try {
            const data = await fetchRoots();
            state.totalCount = data.total_count;
            state.rootNode = data.root;
            leftCount.textContent = formatCount(state.totalCount);

            const rootDiv = document.createElement("div");
            rootDiv.className = "tree-root";

            // Render the PA root node as expanded
            const rootNodeData = data.root;
            labelCache.set(rootNodeData.id, rootNodeData.label);
            const rootBlock = createNodeBlock(rootNodeData, true, null);
            rootDiv.appendChild(rootBlock);

            // Add children to the root's children container
            const childrenDiv = rootBlock.querySelector(".tree-children");
            for (const child of data.children) {
                const block = createNodeBlock(child, false, null);
                childrenDiv.appendChild(block);
            }

            treeContainer.appendChild(rootDiv);
        } catch (err) {
            console.error("Failed to load roots:", err);
            treeContainer.innerHTML = "<div class='loading'>Erreur de chargement</div>";
        }
    }

    // --- Init ---

    function init() {
        searchInput.addEventListener("input", onSearchInput);
        searchClear.addEventListener("click", onSearchClear);
        renderInitialTree();
    }

    init();
})();
