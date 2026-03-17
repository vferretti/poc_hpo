"""HPO Tree Browser – FastAPI Backend."""

from __future__ import annotations

import csv
import logging
import os
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, ORJSONResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_BASE_DIR = Path(__file__).resolve().parent

HP_OBO_PATH = os.environ.get("HP_OBO_PATH", str(_BASE_DIR / "hp.obo"))

_amended = _BASE_DIR / "hp-fr-amended.babelon.tsv"
BABELON_PATH = os.environ.get(
    "BABELON_PATH",
    str(_amended) if _amended.exists() else str(_BASE_DIR / "hp-fr.babelon.tsv"),
)

PA_ROOT = "HP:0000118"  # Phenotypic abnormality

Lang = Literal["fr", "en"]

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class HPONode:
    id: str
    label_en: str
    label_fr: str = ""
    translation_type: str = ""  # "official" | "automatic" | ""
    children_ids: tuple[str, ...] = ()
    parent_ids: tuple[str, ...] = ()

    def label(self, lang: Lang = "fr") -> str:
        if lang == "fr" and self.label_fr:
            return self.label_fr
        return self.label_en


# ---------------------------------------------------------------------------
# Immutable data store – built once at startup, read-only afterwards
# ---------------------------------------------------------------------------


class HPOData:
    """Read-only container for all HPO data, built at startup."""

    __slots__ = (
        "nodes",
        "pa_subtree_ids",
        "label_lower_fr",
        "label_lower_en",
        "child_count",
        "sorted_children_fr",
        "sorted_children_en",
        "total_count",
        "fr_auto_count",
        "fr_total_count",
    )

    def __init__(self) -> None:
        self.nodes: dict[str, HPONode] = {}
        self.pa_subtree_ids: frozenset[str] = frozenset()
        self.label_lower_fr: dict[str, str] = {}
        self.label_lower_en: dict[str, str] = {}
        self.child_count: dict[str, int] = {}
        self.sorted_children_fr: dict[str, tuple[str, ...]] = {}
        self.sorted_children_en: dict[str, tuple[str, ...]] = {}
        self.total_count: int = 0
        self.fr_auto_count: int = 0
        self.fr_total_count: int = 0

    # -- loaders -----------------------------------------------------------

    def load_hpo(self, path: str) -> None:
        """Parse *hp.obo* and populate nodes + PA subtree."""
        logger.info("Loading HPO data from %s …", path)

        nodes = self.nodes
        # Temporary mutable collections – will be frozen into tuples afterwards.
        tmp_parents: dict[str, list[str]] = {}
        tmp_children: dict[str, list[str]] = {}

        # -- Parse OBO [Term] stanzas -------------------------------------
        current_id: str | None = None
        current_name: str | None = None
        current_is_a: list[str] = []
        is_obsolete = False
        in_term = False

        def _commit_term() -> None:
            if current_id and current_name and not is_obsolete:
                nodes[current_id] = HPONode(id=current_id, label_en=current_name)
                tmp_parents[current_id] = list(current_is_a)

        with open(path, encoding="utf-8") as fh:
            for raw in fh:
                line = raw.rstrip("\n")

                if line == "[Term]":
                    if in_term:
                        _commit_term()
                    current_id = None
                    current_name = None
                    current_is_a = []
                    is_obsolete = False
                    in_term = True
                    continue

                if line.startswith("[") and line.endswith("]"):
                    if in_term:
                        _commit_term()
                    in_term = False
                    continue

                if not in_term:
                    continue

                if line.startswith("id: "):
                    current_id = line[4:]
                elif line.startswith("name: "):
                    current_name = line[6:]
                elif line.startswith("is_a: "):
                    current_is_a.append(line[6:].split(" ", 1)[0])
                elif line.startswith("is_obsolete: true"):
                    is_obsolete = True

            # last stanza
            if in_term:
                _commit_term()

        # -- Build parent → children mapping --------------------------------
        for nid, parents in tmp_parents.items():
            for pid in parents:
                if pid in nodes:
                    tmp_children.setdefault(pid, []).append(nid)

        # -- BFS to find PA subtree -----------------------------------------
        if PA_ROOT not in nodes:
            logger.critical("%s not found in OBO data – aborting", PA_ROOT)
            raise SystemExit(1)

        pa: set[str] = {PA_ROOT}
        queue = deque([PA_ROOT])
        while queue:
            nid = queue.popleft()
            for cid in tmp_children.get(nid, ()):
                if cid not in pa:
                    pa.add(cid)
                    queue.append(cid)

        self.pa_subtree_ids = frozenset(pa)
        self.total_count = len(pa) - 1  # exclude root

        # -- Freeze parent/children tuples on nodes -------------------------
        for nid in pa:
            node = nodes[nid]
            node.parent_ids = tuple(p for p in tmp_parents.get(nid, ()) if p in nodes)
            node.children_ids = tuple(
                sorted(
                    (c for c in tmp_children.get(nid, ()) if c in pa),
                    key=lambda c: nodes[c].label_en.lower(),
                )
            )

        # -- Pre-compute child counts + English search index ----------------
        for nid in pa:
            node = nodes[nid]
            self.child_count[nid] = len(node.children_ids)
            if nid != PA_ROOT:
                self.label_lower_en[nid] = node.label_en.lower()

        # -- Pre-sort children by English label -----------------------------
        for nid in pa:
            self.sorted_children_en[nid] = nodes[nid].children_ids  # already sorted

        del tmp_parents, tmp_children
        logger.info(
            "Loaded %d nodes, %d in PA subtree, %d selectable terms",
            len(nodes), len(pa), self.total_count,
        )

    def load_french(self, path: str) -> None:
        """Apply French translations from a babelon TSV."""
        if not Path(path).exists():
            logger.warning("Babelon file not found at %s – keeping English labels", path)
            # Fallback: French search index == English
            for nid in self.pa_subtree_ids:
                if nid != PA_ROOT and nid in self.nodes:
                    self.label_lower_fr[nid] = self.nodes[nid].label_en.lower()
            self.sorted_children_fr = dict(self.sorted_children_en)
            return

        logger.info("Loading French translations from %s …", path)
        official = 0
        automatic = 0
        nodes = self.nodes
        pa = self.pa_subtree_ids

        with open(path, newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh, delimiter="\t")
            for row in reader:
                if row["predicate_id"] != "rdfs:label":
                    continue
                hp_id = row["subject_id"]
                value = row.get("translation_value", "")
                if hp_id in pa and hp_id in nodes and value:
                    is_auto = row.get("translation_status") == "AUTOMATIC"
                    nodes[hp_id].label_fr = value + (" *" if is_auto else "")
                    nodes[hp_id].translation_type = "automatic" if is_auto else "official"
                    if is_auto:
                        automatic += 1
                    else:
                        official += 1

        # Build French search index
        for nid in pa:
            if nid != PA_ROOT and nid in nodes:
                self.label_lower_fr[nid] = nodes[nid].label("fr").lower()

        # Pre-sort children by French label
        for nid in pa:
            if nid in nodes:
                self.sorted_children_fr[nid] = tuple(
                    sorted(
                        nodes[nid].children_ids,
                        key=lambda c, _nds=nodes: _nds[c].label("fr").lower(),
                    )
                )

        self.fr_auto_count = automatic
        self.fr_total_count = official + automatic
        logger.info("Applied %d official + %d automatic French translations", official, automatic)

    # -- query helpers -----------------------------------------------------

    def sorted_children(self, nid: str, lang: Lang) -> tuple[str, ...]:
        idx = self.sorted_children_fr if lang == "fr" else self.sorted_children_en
        return idx.get(nid, ())

    def node_to_dict(self, node: HPONode, lang: Lang = "fr") -> dict:
        cc = self.child_count.get(node.id, 0)
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


# ---------------------------------------------------------------------------
# Module-level singleton – set once during lifespan, read-only afterwards
# ---------------------------------------------------------------------------

_data: HPOData | None = None


def _get_data() -> HPOData:
    if _data is None:
        raise HTTPException(status_code=503, detail="Data not loaded yet")
    return _data


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _data

    obo = Path(HP_OBO_PATH)
    if not obo.exists():
        logger.critical("HPO OBO file not found at %s – cannot start", obo)
        raise SystemExit(1)

    data = HPOData()
    data.load_hpo(str(obo))
    data.load_french(BABELON_PATH)
    _data = data

    logger.info("Startup complete – %d PA terms ready", data.total_count)
    yield


app = FastAPI(
    title="HPO Tree Browser",
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
)


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------


@app.get("/api/health")
async def health():
    d = _get_data()
    return {"status": "ok", "node_count": len(d.nodes), "pa_count": d.total_count}


@app.get("/api/roots")
async def get_roots(lang: Lang = Query("fr")):
    d = _get_data()
    if PA_ROOT not in d.nodes:
        raise HTTPException(status_code=500, detail="PA root not loaded")

    root_node = d.nodes[PA_ROOT]
    cids = d.sorted_children(PA_ROOT, lang)
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


@app.get("/api/children/{node_id}")
async def get_children(node_id: str, lang: Lang = Query("fr")):
    d = _get_data()
    if node_id not in d.nodes:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    cids = d.sorted_children(node_id, lang)
    return {
        "parent_id": node_id,
        "children": [d.node_to_dict(d.nodes[cid], lang) for cid in cids],
    }


@app.get("/api/search")
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


# ---------------------------------------------------------------------------
# Static files / SPA
# ---------------------------------------------------------------------------

_static_dir = _BASE_DIR / "static"
_react_dist = _static_dir / "dist"

if _react_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(_react_dist / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        return FileResponse(str(_react_dist / "index.html"))
else:
    app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")

    @app.get("/")
    async def landing():
        return FileResponse(str(_static_dir / "landing.html"))

    @app.get("/browser")
    async def browser():
        return FileResponse(str(_static_dir / "index.html"))
