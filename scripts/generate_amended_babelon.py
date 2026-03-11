"""Generate an amended babelon TSV that includes automatic translations for missing terms.

Usage:
    python scripts/generate_amended_babelon.py [--translate]

Without --translate: copies English labels as-is for missing terms (fast, no dependency).
With --translate:    uses deep-translator (Google Translate) to auto-translate (requires pip install deep-translator).

Output: hp-fr-amended.babelon.tsv in the project root.
"""

import csv
import json
import sys
import time
from collections import deque
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
HP_JSON = ROOT_DIR / "hp.json"
BABELON_IN = ROOT_DIR / "hp-fr.babelon.tsv"
BABELON_OUT = ROOT_DIR / "hp-fr-amended.babelon.tsv"
PA_ROOT = "HP:0000118"

BATCH_SIZE = 50  # terms per Google Translate call


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

    # BFS from PA root
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
    """Translate a batch of English terms to French using Google Translate."""
    from deep_translator import GoogleTranslator

    translator = GoogleTranslator(source="en", target="fr")
    results = translator.translate_batch(terms)
    return results


def main():
    use_translate = "--translate" in sys.argv

    print(f"Loading HPO terms from {HP_JSON}...")
    pa_terms = load_pa_terms(HP_JSON)
    print(f"  {len(pa_terms)} active terms under Phenotypic abnormality")

    print(f"Loading existing translations from {BABELON_IN}...")
    existing_rows, translated_ids = load_existing_translations(BABELON_IN)
    print(f"  {len(translated_ids)} terms with French label")

    # Find missing terms
    missing = {hp_id: label for hp_id, label in pa_terms.items() if hp_id not in translated_ids}
    print(f"  {len(missing)} terms need translation")

    if not missing:
        print("Nothing to do — all terms are translated.")
        return

    # Translate
    missing_ids = sorted(missing.keys())
    missing_labels = [missing[hp_id] for hp_id in missing_ids]
    translations: dict[str, str] = {}

    if use_translate:
        print(f"Translating {len(missing_labels)} terms via Google Translate (batch size {BATCH_SIZE})...")
        for i in range(0, len(missing_labels), BATCH_SIZE):
            batch = missing_labels[i : i + BATCH_SIZE]
            batch_ids = missing_ids[i : i + BATCH_SIZE]
            try:
                results = translate_batch(batch)
                for hp_id, fr_label in zip(batch_ids, results):
                    translations[hp_id] = fr_label
            except Exception as e:
                print(f"  Error at batch {i}: {e}")
                for hp_id, en_label in zip(batch_ids, batch):
                    translations[hp_id] = en_label
            done = min(i + BATCH_SIZE, len(missing_labels))
            print(f"  {done}/{len(missing_labels)}")
            if i + BATCH_SIZE < len(missing_labels):
                time.sleep(1)  # rate limit
    else:
        print("No --translate flag: using English labels as placeholders.")
        for hp_id in missing_ids:
            translations[hp_id] = missing[hp_id]

    # Write amended file
    print(f"Writing {BABELON_OUT}...")
    fieldnames = ["subject_id", "source_language", "translation_language", "predicate_id", "source_value", "translation_status", "translation_value"]

    with open(BABELON_OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter="\t")
        writer.writeheader()

        # Write all existing rows
        for row in existing_rows:
            writer.writerow(row)

        # Append auto-translated rows
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
