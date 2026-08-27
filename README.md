# HPO Tree Browser - POC

A web application for browsing, searching, and selecting terms from the Human Phenotype Ontology (HPO) tree, scoped to the **Phenotypic abnormality** (HP:0000118) subtree (~18,700 terms).

## Quick Start (Docker)

```bash
docker compose up
```

Open **http://localhost:8000** in your browser.

The first build takes ~1 minute to install dependencies and build the React frontend. Subsequent starts are instant.

To stop:

```bash
docker compose down
```

## Features

- **Tree browsing** — The tree starts collapsed showing the top-level categories (bold). Click the arrows to expand branches. Children are loaded on demand from the server.
- **Search** — Type at least 3 characters in the search box (text or HP ID). The server finds all matching terms and expands the direct ancestor paths. Matching text is highlighted in yellow. A 600ms debounce prevents search from blocking typing.
- **Accent-insensitive search** — Accents, the `œ`/`æ` ligatures, typographic apostrophes and non-breaking spaces are folded on both sides of the comparison (`app/text.py`), because the French labels use both spellings of the same word: `deficience` and `déficience` both return 51 terms, `coeur` and `cœur` both return 21. Highlighting folds the same way (`PhenotypeTree/fold.ts`), so what matched is what gets marked.
- **Bilingual FR/EN** — Toggle between French and English via the FR/EN button. French translations combine official (hpo-translations) and automatic (Google Translate, marked with *). Tooltips show the English term and indicate the translation source.
- **Multiple inheritance** — HPO terms can have multiple parents. The search tree uses path-based keys to display all paths to a matching term.
- **Selection** — Check the box next to any term (or click its label) to add it to the right panel. Selections persist across search/browse mode changes. Click the trash icon to remove a selection.
- **Counts** — The left panel shows total terms or match count during search. The right panel shows selected count.
- **Suggestions** — The landing page shows pre-configured suggestions per analysis type, with a collapsible list if more than 8 items.

## How it works

- **Backend**: Python FastAPI server that loads `hp.obo` and the French Babelon translations into memory at startup. Pre-computes folded labels (accent-insensitive search index), child counts and per-language sorted children. Four API endpoints: health, roots, lazy-load children, and search with ancestor path computation.
- **Frontend**: React + Ant Design (antd Tree component), built with Vite.

## Updating the HPO data

Download from [HPO releases](https://hpo.jax.org/data/ontology), replace `hp.obo` (and the Babelon translation TSV if a newer one is published), then rebuild:

```bash
docker compose build
docker compose up
```

## Running without Docker

Requires Python 3.12+ and Node 18+.

```bash
# Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000

# Frontend (dev mode with hot reload)
cd frontend
npm ci
npm run dev
```

## Project structure

```
app/                      Backend (FastAPI)
  main.py                 App entry point, startup loading, SPA serving
  config.py               Paths and PA_ROOT
  models.py               HPONode / HPOData (in-memory indexes)
  text.py                 fold() — the accent-insensitive search key
  loaders/obo.py          hp.obo parser, hierarchy, precomputed indexes
  loaders/babelon.py      French translations
  routes/hpo.py           health, roots, children, search
frontend/                 React frontend (Vite + antd)
  src/
    api/hpoTreeApi.ts     API client
    components/
      PhenotypeTree/      Tree browser + modal components
        fold.ts           Mirror of app/text.py, for highlighting
      Landing/            Main page with selected HPOs table
hp.obo                    HPO ontology (10 MB, OBO format)
hp-fr-amended.babelon.tsv French translations (official + automatic)
auto_translations.tsv     Auto-translated terms only (for review)
util/                     Standalone translation tool (see util/README.md)
Dockerfile                Multi-stage build (Node + Python)
docker-compose.yml        One-command deployment
```

## French translations

The tree supports bilingual display (FR/EN toggle). French translations come from two sources:

- **Official** (~13,500 terms): from [hpo-translations](https://github.com/obophenotype/hpo-translations) (`hp-fr.babelon.tsv`)
- **Automatic** (~5,100 terms): translated via Google Translate using the standalone tool in `util/`

Both are combined in `hp-fr-amended.babelon.tsv`. Automatic translations are marked with `translation_status: AUTOMATIC` and displayed with an asterisk (*) in the UI. Tooltips indicate the translation source and show the original English term.

To regenerate translations after updating HPO data, see `util/README.md`.

## Integration into clin-prescription-ui

See the detailed integration plan, security considerations, and list of impacted files on Notion:

**[Intégration du POC HPO dans clin-prescription-ui](https://www.notion.so/ferlab/Int-gration-du-POC-HPO-dans-clin-prescription-ui-31cb0fcecb3d810a8505e080adc60dff)**

Every source file also contains `// INTEGRATION:` comments with inline instructions specific to that file.
