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
- **Search** — Type at least 3 characters in the search box. The server finds all matching terms and expands the direct ancestor paths. Matching text is highlighted in yellow. A 600ms debounce prevents search from blocking typing.
- **Multiple inheritance** — HPO terms can have multiple parents. The search tree uses path-based keys to display all paths to a matching term.
- **Selection** — Check the box next to any term (or click its label) to add it to the right panel. Selections persist across search/browse mode changes. Click the trash icon to remove a selection.
- **Counts** — The left panel shows total terms or match count during search. The right panel shows selected count.

## How it works

- **Backend**: Python FastAPI server that loads `hp.json` (HPO in OBO Graph JSON format) into memory at startup. Pre-computes lowercase labels and child counts for fast search. Three API endpoints: roots, lazy-load children, and search with ancestor path computation.
- **Frontend**: React + Ant Design (antd Tree component), built with Vite.

## Updating the HPO data

Download from [HPO releases](https://hpo.jax.org/data/ontology), replace `hp.json`, then rebuild:

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
main.py                   Backend (FastAPI, data loading, 3 API endpoints)
frontend/                 React frontend (Vite + antd)
  src/
    api/hpoTreeApi.ts     API client
    components/
      PhenotypeTree/      Tree browser + modal components
      Landing/            Main page with selected HPOs table
hp.json                   HPO data file (22 MB, OBO Graph JSON)
Dockerfile                Multi-stage build (Node + Python)
docker-compose.yml        One-command deployment
```
