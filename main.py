"""HPO Tree Browser POC - FastAPI Backend."""

import csv
import json
import os
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

HP_JSON_PATH = os.environ.get("HP_JSON_PATH", str(Path(__file__).resolve().parent / "hp.json"))
_default_babelon = Path(__file__).resolve().parent
BABELON_PATH = os.environ.get(
    "BABELON_PATH",
    str(_default_babelon / "hp-fr-amended.babelon.tsv")
    if (_default_babelon / "hp-fr-amended.babelon.tsv").exists()
    else str(_default_babelon / "hp-fr.babelon.tsv"),
)
PA_ROOT = "HP:0000118"  # Phenotypic abnormality


@dataclass
class HPONode:
    id: str
    label_en: str
    label_fr: str = ""
    translation_type: str = ""  # "official", "automatic", or "" (no translation)
    children_ids: list[str] = field(default_factory=list)
    parent_ids: list[str] = field(default_factory=list)

    def label(self, lang: str = "fr") -> str:
        if lang == "fr" and self.label_fr:
            return self.label_fr
        return self.label_en

    @property
    def is_leaf(self) -> bool:
        return len(self.children_ids) == 0


# Global in-memory store
nodes: dict[str, HPONode] = {}
pa_subtree_ids: set[str] = set()
label_lower_fr: dict[str, str] = {}  # pre-computed lowercase French labels
label_lower_en: dict[str, str] = {}  # pre-computed lowercase English labels
child_count_cache: dict[str, int] = {}  # pre-computed PA child counts
total_count: int = 0
fr_auto_count: int = 0  # number of automatically translated terms
fr_total_count: int = 0  # total number of French translations (official + auto)


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
        nodes[hp_id] = HPONode(id=hp_id, label_en=label)

    # Parse edges (all are is_a)
    for e in graph["edges"]:
        child_id = _url_to_hp_id(e["sub"])
        parent_id = _url_to_hp_id(e["obj"])
        if child_id not in nodes or parent_id not in nodes:
            continue
        nodes[parent_id].children_ids.append(child_id)
        nodes[child_id].parent_ids.append(parent_id)

    # Sort children alphabetically by English label (will be re-sorted after French load)
    for node in nodes.values():
        node.children_ids.sort(key=lambda cid: nodes[cid].label_en.lower() if cid in nodes else "")

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

    # Pre-compute child counts and English search index
    for nid in pa_subtree_ids:
        if nid in nodes:
            child_count_cache[nid] = sum(1 for cid in nodes[nid].children_ids if cid in pa_subtree_ids)
            if nid != PA_ROOT:
                label_lower_en[nid] = nodes[nid].label_en.lower()

    # Free the raw JSON data
    del data
    print(f"Loaded {len(nodes)} total nodes, {len(pa_subtree_ids)} in PA subtree, {total_count} selectable terms.")


def load_french_labels(path: str) -> None:
    """Load French translations from babelon TSV and apply them to HPO nodes."""
    if not Path(path).exists():
        print(f"WARNING: Babelon file not found at {path}, keeping English labels.")
        return

    print(f"Loading French translations from {path}...")
    official = 0
    automatic = 0
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            if row["predicate_id"] != "rdfs:label":
                continue
            hp_id = row["subject_id"]
            if hp_id in pa_subtree_ids and hp_id in nodes and row["translation_value"]:
                is_auto = row.get("translation_status") == "AUTOMATIC"
                suffix = " *" if is_auto else ""
                nodes[hp_id].label_fr = row["translation_value"] + suffix
                nodes[hp_id].translation_type = "automatic" if is_auto else "official"
                if is_auto:
                    automatic += 1
                else:
                    official += 1

    # Build French search index (falls back to English for untranslated terms)
    for nid in pa_subtree_ids:
        if nid in nodes and nid != PA_ROOT:
            label_lower_fr[nid] = nodes[nid].label("fr").lower()

    global fr_auto_count, fr_total_count
    fr_auto_count = automatic
    fr_total_count = official + automatic

    print(f"Applied {official} official + {automatic} automatic French translations.")


def _node_to_dict(node: HPONode, lang: str = "fr") -> dict:
    """Convert a node to the API response format."""
    cc = child_count_cache.get(node.id, 0)
    d: dict = {
        "id": node.id,
        "label": node.label(lang),
        "is_leaf": cc == 0,
        "child_count": cc,
    }
    if lang == "fr" and node.label_fr:
        d["label_en"] = node.label_en
        d["translation_type"] = node.translation_type
    return d


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_hpo_data(HP_JSON_PATH)
    load_french_labels(BABELON_PATH)
    yield


app = FastAPI(title="HPO Tree Browser", lifespan=lifespan)


# --- API Endpoints ---

@app.get("/api/roots")
async def get_roots(lang: str = Query("fr", regex="^(fr|en)$")):
    """Return the direct children of Phenotypic abnormality."""
    if PA_ROOT not in nodes:
        raise HTTPException(status_code=500, detail="PA root not loaded")

    root_node = nodes[PA_ROOT]
    valid_cids = [cid for cid in root_node.children_ids if cid in pa_subtree_ids and cid in nodes]
    valid_cids.sort(key=lambda cid: nodes[cid].label(lang).lower())
    children = [_node_to_dict(nodes[cid], lang) for cid in valid_cids]
    resp = {
        "root": _node_to_dict(root_node, lang),
        "children": children,
        "total_count": total_count,
    }
    if lang == "fr" and fr_auto_count > 0:
        resp["auto_translate_count"] = fr_auto_count
        resp["fr_total_count"] = total_count
    return resp


@app.get("/api/children/{node_id}")
async def get_children(node_id: str, lang: str = Query("fr", regex="^(fr|en)$")):
    """Return the direct children of a given node (lazy loading)."""
    if node_id not in nodes:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    node = nodes[node_id]
    valid_cids = [cid for cid in node.children_ids if cid in pa_subtree_ids and cid in nodes]
    valid_cids.sort(key=lambda cid: nodes[cid].label(lang).lower())
    children = [_node_to_dict(nodes[cid], lang) for cid in valid_cids]
    return {
        "parent_id": node_id,
        "children": children,
    }


@app.get("/api/search")
async def search(q: str = Query(..., min_length=3), lang: str = Query("fr", regex="^(fr|en)$")):
    """Search for HPO terms by label substring. Returns matching nodes and their ancestor paths."""
    query_lower = q.lower()
    search_index = label_lower_fr if lang == "fr" else label_lower_en

    # Step 1: Find matching nodes in PA subtree (label + HP ID)
    matched_ids = set()
    for nid, lbl in search_index.items():
        if query_lower in lbl or query_lower in nid.lower():
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
        nd: dict = {
            "id": n.id,
            "label": n.label(lang),
            "is_leaf": cc == 0,
            "child_count": cc,
            "parent_ids": [pid for pid in n.parent_ids if pid in pa_subtree_ids],
        }
        if lang == "fr" and n.label_fr:
            nd["label_en"] = n.label_en
            nd["translation_type"] = n.translation_type
        nodes_data[nid] = nd

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
