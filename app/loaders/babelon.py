"""Load French translations from a Babelon TSV file."""

from __future__ import annotations

import csv
import logging
from pathlib import Path

from app.config import PA_ROOT
from app.models import HPOData

logger = logging.getLogger(__name__)


def load_french(data: HPOData, path: str) -> None:
    """Apply French translations from a babelon TSV onto *data*."""
    if not Path(path).exists():
        logger.warning("Babelon file not found at %s – keeping English labels", path)
        for nid in data.pa_subtree_ids:
            if nid != PA_ROOT and nid in data.nodes:
                data.label_lower_fr[nid] = data.nodes[nid].label_en.lower()
        data.sorted_children_fr = dict(data.sorted_children_en)
        return

    logger.info("Loading French translations from %s …", path)
    official = 0
    automatic = 0
    nodes = data.nodes
    pa = data.pa_subtree_ids

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
            data.label_lower_fr[nid] = nodes[nid].label("fr").lower()

    # Pre-sort children by French label
    for nid in pa:
        if nid in nodes:
            data.sorted_children_fr[nid] = tuple(
                sorted(
                    nodes[nid].children_ids,
                    key=lambda c, _nds=nodes: _nds[c].label("fr").lower(),
                )
            )

    data.fr_auto_count = automatic
    data.fr_total_count = official + automatic
    logger.info("Applied %d official + %d automatic French translations", official, automatic)
