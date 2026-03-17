"""Domain models for HPO data."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.config import Lang


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


class HPOData:
    """Read-only container for all HPO data, built once at startup."""

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

    def get_sorted_children(self, nid: str, lang: Lang) -> tuple[str, ...]:
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
