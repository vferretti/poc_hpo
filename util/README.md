# HPO Translation Utility

Translates HPO (Human Phenotype Ontology) terms that are missing from the official French translation file (`hp-fr.babelon.tsv`) using Google Translate, and produces an amended file (`hp-fr-amended.babelon.tsv`) that combines official + automatic translations.

Auto-translated terms are marked with `translation_status: AUTOMATIC` so the app can flag them in the UI.

## Setup (once)

```bash
cd util
python3 -m venv venv
venv/bin/pip install -r requirements.txt
```

## Usage

From the project root:

```bash
util/venv/bin/python util/translate_missing.py .
```

Or from the `util/` directory:

```bash
venv/bin/python translate_missing.py ..
```

The script expects these files in the target directory:
- `hp.json` — HPO ontology (download from https://hpo.jax.org)
- `hp-fr.babelon.tsv` — official French translations (download from https://github.com/obophenotype/hpo-translations)

## Resumability

Translations are cached in `translation_cache.json` after each batch. If the script is interrupted, re-running it will skip already-translated terms. Delete `translation_cache.json` to start fresh.
