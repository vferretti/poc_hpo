"""HPO Tree Browser POC - FastAPI Backend."""

import json
import os
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

HP_JSON_PATH = os.environ.get("HP_JSON_PATH", str(Path(__file__).resolve().parent.parent / "hp.json"))
PA_ROOT = "HP:0000118"  # Phenotypic abnormality


@dataclass
class HPONode:
    id: str
    label: str
    children_ids: list[str] = field(default_factory=list)
    parent_ids: list[str] = field(default_factory=list)

    @property
    def is_leaf(self) -> bool:
        return len(self.children_ids) == 0


# Global in-memory store
nodes: dict[str, HPONode] = {}
pa_subtree_ids: set[str] = set()
label_lower: dict[str, str] = {}  # pre-computed lowercase labels for search
child_count_cache: dict[str, int] = {}  # pre-computed PA child counts
total_count: int = 0


def _url_to_hp_id(url: str) -> str:
    """Convert 'http://purl.obolibrary.org/obo/HP_0000118' to 'HP:0000118'."""
    segment = url.rsplit("/", 1)[-1]
    return segment.replace("_", ":")


def _is_deprecated(node_meta: dict | None) -> bool:
    if not node_meta:
        return False
    return node_meta.get("deprecated", False)


def load_hpo_data(path: str) -> None:
    global total_count

    print(f"Loading HPO data from {path}...")
    with open(path) as f:
        data = json.load(f)

    graph = data["graphs"][0]

    # Parse nodes
    for n in graph["nodes"]:
        if n.get("type") != "CLASS":
            continue
        if _is_deprecated(n.get("meta")):
            continue
        hp_id = _url_to_hp_id(n["id"])
        label = n.get("lbl", "")
        if not label:
            continue
        nodes[hp_id] = HPONode(id=hp_id, label=label)

    # Parse edges (all are is_a)
    for e in graph["edges"]:
        child_id = _url_to_hp_id(e["sub"])
        parent_id = _url_to_hp_id(e["obj"])
        if child_id not in nodes or parent_id not in nodes:
            continue
        nodes[parent_id].children_ids.append(child_id)
        nodes[child_id].parent_ids.append(parent_id)

    # Sort children alphabetically by label
    for node in nodes.values():
        node.children_ids.sort(key=lambda cid: nodes[cid].label.lower() if cid in nodes else "")

    # Build PA subtree set (BFS from PA_ROOT)
    if PA_ROOT not in nodes:
        print(f"WARNING: {PA_ROOT} not found in data!")
        return

    queue = deque([PA_ROOT])
    pa_subtree_ids.add(PA_ROOT)
    while queue:
        nid = queue.popleft()
        for cid in nodes[nid].children_ids:
            if cid not in pa_subtree_ids:
                pa_subtree_ids.add(cid)
                queue.append(cid)

    total_count = len(pa_subtree_ids) - 1  # exclude the root itself

    # Pre-compute lowercase labels and child counts for fast search
    for nid in pa_subtree_ids:
        if nid in nodes:
            n = nodes[nid]
            child_count_cache[nid] = sum(1 for cid in n.children_ids if cid in pa_subtree_ids)
            if nid != PA_ROOT:
                label_lower[nid] = n.label.lower()

    # Free the raw JSON data
    del data
    print(f"Loaded {len(nodes)} total nodes, {len(pa_subtree_ids)} in PA subtree, {total_count} selectable terms.")


def _node_to_dict(node: HPONode) -> dict:
    """Convert a node to the API response format."""
    cc = child_count_cache.get(node.id, 0)
    return {
        "id": node.id,
        "label": node.label,
        "is_leaf": cc == 0,
        "child_count": cc,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_hpo_data(HP_JSON_PATH)
    yield


app = FastAPI(title="HPO Tree Browser", lifespan=lifespan)


# --- API Endpoints ---

@app.get("/api/roots")
async def get_roots():
    """Return the direct children of Phenotypic abnormality."""
    if PA_ROOT not in nodes:
        raise HTTPException(status_code=500, detail="PA root not loaded")

    root_node = nodes[PA_ROOT]
    children = [
        _node_to_dict(nodes[cid])
        for cid in root_node.children_ids
        if cid in pa_subtree_ids and cid in nodes
    ]
    return {
        "root": _node_to_dict(root_node),
        "children": children,
        "total_count": total_count,
    }


@app.get("/api/children/{node_id}")
async def get_children(node_id: str):
    """Return the direct children of a given node (lazy loading)."""
    if node_id not in nodes:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    node = nodes[node_id]
    children = [
        _node_to_dict(nodes[cid])
        for cid in node.children_ids
        if cid in pa_subtree_ids and cid in nodes
    ]
    return {
        "parent_id": node_id,
        "children": children,
    }


@app.get("/api/search")
async def search(q: str = Query(..., min_length=3)):
    """Search for HPO terms by label substring. Returns matching nodes and their ancestor paths."""
    query_lower = q.lower()

    # Step 1: Find matching nodes in PA subtree (uses pre-computed lowercase labels)
    matched_ids = set()
    for nid, lbl in label_lower.items():
        if query_lower in lbl:
            matched_ids.add(nid)

    # Step 2: Walk up to find all ancestors (for expanding)
    expanded_ids = set()
    visited = set(matched_ids)
    queue = deque(matched_ids)
    while queue:
        nid = queue.popleft()
        for pid in nodes[nid].parent_ids:
            if pid not in pa_subtree_ids:
                continue
            expanded_ids.add(pid)
            if pid not in visited:
                visited.add(pid)
                queue.append(pid)

    # PA_ROOT itself should be expanded if there are matches
    if matched_ids:
        expanded_ids.add(PA_ROOT)

    # Step 3: Collect all nodes to return
    # Only include nodes on the direct path (ancestors + matches), no siblings
    all_node_ids = set(matched_ids) | set(expanded_ids)

    # Build response nodes
    nodes_data = {}
    for nid in all_node_ids:
        if nid not in nodes:
            continue
        n = nodes[nid]
        cc = child_count_cache.get(nid, 0)
        nodes_data[nid] = {
            "id": n.id,
            "label": n.label,
            "is_leaf": cc == 0,
            "child_count": cc,
            "parent_ids": [pid for pid in n.parent_ids if pid in pa_subtree_ids],
        }

    return {
        "query": q,
        "match_count": len(matched_ids),
        "matched_ids": list(matched_ids),
        "expanded_ids": list(expanded_ids),
        "nodes": nodes_data,
    }


# --- Static files ---

static_dir = Path(__file__).resolve().parent / "static"
react_dist = static_dir / "dist"

# Serve React build if available, otherwise fall back to vanilla static files
if react_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(react_dist / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        """Serve the React SPA for all non-API routes."""
        return FileResponse(str(react_dist / "index.html"))
else:
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.get("/")
    async def landing():
        return FileResponse(str(static_dir / "landing.html"))

    @app.get("/browser")
    async def browser():
        return FileResponse(str(static_dir / "index.html"))
