"""Translate missing HPO terms from English to French using Google Translate.

Standalone tool — lives outside the poc_hpo repo so the main project
has no dependency on deep-translator.

Usage:
    # First time setup:
    python3 -m venv venv && venv/bin/pip install -r requirements.txt

    # Run translation (outputs hp-fr-amended.babelon.tsv next to hp-fr.babelon.tsv):
    venv/bin/python translate_missing.py /path/to/poc_hpo

    The script expects these files in the target directory:
      - hp.obo             (HPO ontology in OBO format)
      - hp-fr.babelon.tsv  (official French translations)

    Output:
      - hp-fr-amended.babelon.tsv  (official + auto-translated terms)
"""

import csv
import json
import logging
import sys
import time
from collections import deque
from pathlib import Path

from deep_translator import GoogleTranslator

logger = logging.getLogger(__name__)

PA_ROOT = "HP:0000118"
BATCH_SIZE = 100


def load_pa_terms(hp_obo_path: Path) -> dict[str, str]:
    """Return {hp_id: english_label} for all active terms under Phenotypic abnormality."""
    nodes: dict[str, str] = {}
    children: dict[str, list[str]] = {}

    with open(hp_obo_path, encoding="utf-8") as f:
        current_id = None
        current_name = None
        current_parents: list[str] = []
        is_obsolete = False
        in_term = False

        def _save_term():
            if current_id and current_name and not is_obsolete:
                nodes[current_id] = current_name
                for pid in current_parents:
                    children.setdefault(pid, []).append(current_id)

        for line in f:
            line = line.rstrip("\n")
            if line == "[Term]":
                if in_term:
                    _save_term()
                current_id = None
                current_name = None
                current_parents = []
                is_obsolete = False
                in_term = True
                continue
            if line.startswith("[") and line.endswith("]"):
                if in_term:
                    _save_term()
                in_term = False
                continue
            if not in_term:
                continue
            if line.startswith("id: "):
                current_id = line[4:]
            elif line.startswith("name: "):
                current_name = line[6:]
            elif line.startswith("is_a: "):
                current_parents.append(line[6:].split(" ", 1)[0])
            elif line.startswith("is_obsolete: true"):
                is_obsolete = True

        if in_term:
            _save_term()

    pa_terms: dict[str, str] = {}
    queue = deque([PA_ROOT])
    visited = {PA_ROOT}
    while queue:
        nid = queue.popleft()
        if nid in nodes:
            pa_terms[nid] = nodes[nid]
        for cid in children.get(nid, []):
            if cid not in visited:
                visited.add(cid)
                queue.append(cid)

    return pa_terms


def load_existing_translations(babelon_path: Path) -> tuple[list[dict], set[str]]:
    """Return (all_rows, set_of_ids_with_label_translation)."""
    rows = []
    translated_ids = set()
    with open(babelon_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            rows.append(row)
            if row["predicate_id"] == "rdfs:label":
                translated_ids.add(row["subject_id"])
    return rows, translated_ids


def translate_batch(terms: list[str]) -> list[str]:
    translator = GoogleTranslator(source="en", target="fr")
    return translator.translate_batch(terms)


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    if len(sys.argv) < 2:
        logger.error("Usage: %s /path/to/poc_hpo", sys.argv[0])
        sys.exit(1)

    target_dir = Path(sys.argv[1]).resolve()
    hp_obo = target_dir / "hp.obo"
    babelon_in = target_dir / "hp-fr.babelon.tsv"
    babelon_out = target_dir / "hp-fr-amended.babelon.tsv"

    for f in (hp_obo, babelon_in):
        if not f.exists():
            logger.error("File not found: %s", f)
            sys.exit(1)

    logger.info("Loading HPO terms from %s …", hp_obo)
    pa_terms = load_pa_terms(hp_obo)
    logger.info("  %d active terms under Phenotypic abnormality", len(pa_terms))

    logger.info("Loading existing translations from %s …", babelon_in)
    existing_rows, translated_ids = load_existing_translations(babelon_in)
    logger.info("  %d terms with French label", len(translated_ids))

    missing = {hp_id: label for hp_id, label in pa_terms.items() if hp_id not in translated_ids}
    logger.info("  %d terms need translation", len(missing))

    if not missing:
        logger.info("Nothing to do — all terms are translated.")
        return

    missing_ids = sorted(missing.keys())
    missing_labels = [missing[hp_id] for hp_id in missing_ids]

    # Load cached translations from previous interrupted runs
    cache_file = Path(__file__).resolve().parent / "translation_cache.json"
    translations: dict[str, str] = {}
    if cache_file.exists():
        with open(cache_file) as cf:
            translations = json.load(cf)
        logger.info("  Loaded %d cached translations from previous run", len(translations))

    # Filter out already-translated terms
    remaining_ids = [hp_id for hp_id in missing_ids if hp_id not in translations]
    remaining_labels = [missing[hp_id] for hp_id in remaining_ids]

    if remaining_labels:
        logger.info("Translating %d terms via Google Translate (batch size %d) …", len(remaining_labels), BATCH_SIZE)
        for i in range(0, len(remaining_labels), BATCH_SIZE):
            batch = remaining_labels[i : i + BATCH_SIZE]
            batch_ids = remaining_ids[i : i + BATCH_SIZE]
            try:
                results = translate_batch(batch)
                for hp_id, fr_label in zip(batch_ids, results):
                    translations[hp_id] = fr_label
            except Exception:
                logger.warning("Error at batch %d — falling back to English for this batch", i, exc_info=True)
                for hp_id, en_label in zip(batch_ids, batch):
                    translations[hp_id] = en_label
            # Save cache after each batch
            with open(cache_file, "w") as cf:
                json.dump(translations, cf)
            done = min(i + BATCH_SIZE, len(remaining_labels))
            logger.info("  %d/%d", done, len(remaining_labels))
            if i + BATCH_SIZE < len(remaining_labels):
                time.sleep(1)
    else:
        logger.info("All terms already in cache — writing output.")

    fieldnames = ["subject_id", "source_language", "translation_language",
                  "predicate_id", "source_value", "translation_status", "translation_value"]

    logger.info("Writing %s …", babelon_out)
    with open(babelon_out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter="\t")
        writer.writeheader()
        for row in existing_rows:
            writer.writerow(row)
        for hp_id in missing_ids:
            writer.writerow({
                "subject_id": hp_id,
                "source_language": "en",
                "translation_language": "fr",
                "predicate_id": "rdfs:label",
                "source_value": missing[hp_id],
                "translation_status": "AUTOMATIC",
                "translation_value": translations[hp_id],
            })

    official = len(translated_ids)
    auto = len(translations)
    logger.info("Done: %d official + %d automatic = %d total label translations", official, auto, official + auto)


if __name__ == "__main__":
    main()
