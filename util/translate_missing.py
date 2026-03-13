"""Translate missing HPO terms from English to French using Google Translate.

Standalone tool — lives outside the poc_hpo repo so the main project
has no dependency on deep-translator.

Usage:
    # First time setup:
    python3 -m venv venv && venv/bin/pip install -r requirements.txt

    # Run translation (outputs hp-fr-amended.babelon.tsv next to hp-fr.babelon.tsv):
    venv/bin/python translate_missing.py /path/to/poc_hpo

    The script expects these files in the target directory:
      - hp.json            (HPO ontology)
      - hp-fr.babelon.tsv  (official French translations)

    Output:
      - hp-fr-amended.babelon.tsv  (official + auto-translated terms)
"""

import csv
import json
import sys
import time
from collections import deque
from pathlib import Path

from deep_translator import GoogleTranslator

PA_ROOT = "HP:0000118"
BATCH_SIZE = 100


def load_pa_terms(hp_json_path: Path) -> dict[str, str]:
    """Return {hp_id: english_label} for all active terms under Phenotypic abnormality."""
    with open(hp_json_path) as f:
        data = json.load(f)

    graph = data["graphs"][0]
    nodes: dict[str, str] = {}
    children: dict[str, list[str]] = {}

    for n in graph["nodes"]:
        if n.get("type") != "CLASS":
            continue
        if n.get("meta", {}).get("deprecated", False):
            continue
        hp_id = n["id"].rsplit("/", 1)[-1].replace("_", ":")
        label = n.get("lbl", "")
        if label:
            nodes[hp_id] = label

    for e in graph["edges"]:
        sub = e["sub"].rsplit("/", 1)[-1].replace("_", ":")
        obj = e["obj"].rsplit("/", 1)[-1].replace("_", ":")
        if sub in nodes and obj in nodes:
            children.setdefault(obj, []).append(sub)

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
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} /path/to/poc_hpo")
        sys.exit(1)

    target_dir = Path(sys.argv[1]).resolve()
    hp_json = target_dir / "hp.json"
    babelon_in = target_dir / "hp-fr.babelon.tsv"
    babelon_out = target_dir / "hp-fr-amended.babelon.tsv"

    for f in (hp_json, babelon_in):
        if not f.exists():
            print(f"Error: {f} not found")
            sys.exit(1)

    print(f"Loading HPO terms from {hp_json}...")
    pa_terms = load_pa_terms(hp_json)
    print(f"  {len(pa_terms)} active terms under Phenotypic abnormality")

    print(f"Loading existing translations from {babelon_in}...")
    existing_rows, translated_ids = load_existing_translations(babelon_in)
    print(f"  {len(translated_ids)} terms with French label")

    missing = {hp_id: label for hp_id, label in pa_terms.items() if hp_id not in translated_ids}
    print(f"  {len(missing)} terms need translation")

    if not missing:
        print("Nothing to do — all terms are translated.")
        return

    missing_ids = sorted(missing.keys())
    missing_labels = [missing[hp_id] for hp_id in missing_ids]

    # Load cached translations from previous interrupted runs
    cache_file = Path(__file__).resolve().parent / "translation_cache.json"
    translations: dict[str, str] = {}
    if cache_file.exists():
        with open(cache_file) as cf:
            translations = json.load(cf)
        print(f"  Loaded {len(translations)} cached translations from previous run")

    # Filter out already-translated terms
    remaining_ids = [hp_id for hp_id in missing_ids if hp_id not in translations]
    remaining_labels = [missing[hp_id] for hp_id in remaining_ids]

    if remaining_labels:
        print(f"Translating {len(remaining_labels)} terms via Google Translate (batch size {BATCH_SIZE})...")
        for i in range(0, len(remaining_labels), BATCH_SIZE):
            batch = remaining_labels[i : i + BATCH_SIZE]
            batch_ids = remaining_ids[i : i + BATCH_SIZE]
            try:
                results = translate_batch(batch)
                for hp_id, fr_label in zip(batch_ids, results):
                    translations[hp_id] = fr_label
            except Exception as e:
                print(f"  Error at batch {i}: {e} — falling back to English for this batch")
                for hp_id, en_label in zip(batch_ids, batch):
                    translations[hp_id] = en_label
            # Save cache after each batch
            with open(cache_file, "w") as cf:
                json.dump(translations, cf)
            done = min(i + BATCH_SIZE, len(remaining_labels))
            print(f"  {done}/{len(remaining_labels)}")
            if i + BATCH_SIZE < len(remaining_labels):
                time.sleep(1)
    else:
        print("All terms already in cache — writing output.")

    fieldnames = ["subject_id", "source_language", "translation_language",
                  "predicate_id", "source_value", "translation_status", "translation_value"]

    print(f"Writing {babelon_out}...")
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
    print(f"Done: {official} official + {auto} automatic = {official + auto} total label translations.")


if __name__ == "__main__":
    main()
