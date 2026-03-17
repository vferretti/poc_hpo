"""Parse an OBO ontology file into HPOData."""

from __future__ import annotations

import logging
from collections import deque

from app.config import PA_ROOT
from app.models import HPOData, HPONode

logger = logging.getLogger(__name__)


def load_obo(data: HPOData, path: str) -> None:
    """Parse *hp.obo* and populate ``data.nodes`` + PA subtree indexes."""
    logger.info("Loading HPO data from %s …", path)

    nodes = data.nodes
    tmp_parents: dict[str, list[str]] = {}
    tmp_children: dict[str, list[str]] = {}

    # -- Parse [Term] stanzas ------------------------------------------------
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

    # -- Build parent → children mapping -------------------------------------
    for nid, parents in tmp_parents.items():
        for pid in parents:
            if pid in nodes:
                tmp_children.setdefault(pid, []).append(nid)

    # -- BFS to find PA subtree ----------------------------------------------
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

    data.pa_subtree_ids = frozenset(pa)
    data.total_count = len(pa) - 1  # exclude root

    # -- Freeze parent/children tuples on nodes ------------------------------
    for nid in pa:
        node = nodes[nid]
        node.parent_ids = tuple(p for p in tmp_parents.get(nid, ()) if p in nodes)
        node.children_ids = tuple(
            sorted(
                (c for c in tmp_children.get(nid, ()) if c in pa),
                key=lambda c: nodes[c].label_en.lower(),
            )
        )

    # -- Pre-compute child counts + English search index ---------------------
    for nid in pa:
        node = nodes[nid]
        data.child_count[nid] = len(node.children_ids)
        if nid != PA_ROOT:
            data.label_lower_en[nid] = node.label_en.lower()

    # -- Pre-sort children by English label ----------------------------------
    for nid in pa:
        data.sorted_children_en[nid] = nodes[nid].children_ids  # already sorted

    del tmp_parents, tmp_children
    logger.info(
        "Loaded %d nodes, %d in PA subtree, %d selectable terms",
        len(nodes), len(pa), data.total_count,
    )
