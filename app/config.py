"""Application configuration – paths and constants."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

BASE_DIR = Path(__file__).resolve().parent.parent  # poc_hpo/

HP_OBO_PATH = os.environ.get("HP_OBO_PATH", str(BASE_DIR / "hp.obo"))

_amended = BASE_DIR / "hp-fr-amended.babelon.tsv"
BABELON_PATH = os.environ.get(
    "BABELON_PATH",
    str(_amended) if _amended.exists() else str(BASE_DIR / "hp-fr.babelon.tsv"),
)

PA_ROOT = "HP:0000118"  # Phenotypic abnormality

Lang = Literal["fr", "en"]
