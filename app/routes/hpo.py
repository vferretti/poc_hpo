"""HPO API endpoints."""

from __future__ import annotations

from collections import deque

from fastapi import APIRouter, HTTPException, Query

from app.config import PA_ROOT, Lang
from app.models import HPOData

router = APIRouter(prefix="/api")

# Module-level reference, set by main.lifespan via set_data().
_data: HPOData | None = None


def set_data(data: HPOData) -> None:
    global _data
    _data = data


def _get_data() -> HPOData:
    if _data is None:
        raise HTTPException(status_code=503, detail="Data not loaded yet")
    return _data


@router.get("/health")
async def health():
    d = _get_data()
    return {"status": "ok", "node_count": len(d.nodes), "pa_count": d.total_count}


@router.get("/roots")
async def get_roots(lang: Lang = Query("fr")):
    d = _get_data()
    if PA_ROOT not in d.nodes:
        raise HTTPException(status_code=500, detail="PA root not loaded")

    root_node = d.nodes[PA_ROOT]
    cids = d.get_sorted_children(PA_ROOT, lang)
    children = [d.node_to_dict(d.nodes[cid], lang) for cid in cids]

    resp: dict = {
        "root": d.node_to_dict(root_node, lang),
        "children": children,
        "total_count": d.total_count,
    }
    if lang == "fr" and d.fr_auto_count > 0:
        resp["auto_translate_count"] = d.fr_auto_count
        resp["fr_total_count"] = d.total_count
    return resp


@router.get("/children/{node_id}")
async def get_children(node_id: str, lang: Lang = Query("fr")):
    d = _get_data()
    if node_id not in d.nodes:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    cids = d.get_sorted_children(node_id, lang)
    return {
        "parent_id": node_id,
        "children": [d.node_to_dict(d.nodes[cid], lang) for cid in cids],
    }


@router.get("/search")
async def search(q: str = Query(..., min_length=3), lang: Lang = Query("fr")):
    d = _get_data()
    query_lower = q.lower()
    search_index = d.label_lower_fr if lang == "fr" else d.label_lower_en

    # Find matching nodes (label substring + HP ID)
    matched_ids: set[str] = set()
    for nid, lbl in search_index.items():
        if query_lower in lbl or query_lower in nid.lower():
            matched_ids.add(nid)

    # Walk up ancestors for tree expansion
    expanded_ids: set[str] = set()
    visited = set(matched_ids)
    queue = deque(matched_ids)
    pa = d.pa_subtree_ids
    nodes = d.nodes

    while queue:
        nid = queue.popleft()
        for pid in nodes[nid].parent_ids:
            if pid not in pa:
                continue
            expanded_ids.add(pid)
            if pid not in visited:
                visited.add(pid)
                queue.append(pid)

    if matched_ids:
        expanded_ids.add(PA_ROOT)

    # Build response nodes (matches + ancestors only, no siblings)
    all_ids = matched_ids | expanded_ids
    nodes_data: dict[str, dict] = {}
    for nid in all_ids:
        if nid not in nodes:
            continue
        n = nodes[nid]
        cc = d.child_count.get(nid, 0)
        nd: dict = {
            "id": n.id,
            "label": n.label(lang),
            "is_leaf": cc == 0,
            "child_count": cc,
            "parent_ids": [pid for pid in n.parent_ids if pid in pa],
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
