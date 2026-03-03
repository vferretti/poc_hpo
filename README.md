# HPO Tree Browser - POC

A web application for browsing, searching, and selecting terms from the Human Phenotype Ontology (HPO) tree, scoped to the **Phenotypic abnormality** (HP:0000118) subtree (~18,700 terms).

## Quick Start (Docker)

```bash
docker compose up
```

Open **http://localhost:8000** in your browser.

That's it. The first build takes ~30 seconds to download the Python image and install dependencies. Subsequent starts are instant.

To stop:

```bash
docker compose down
```

## Features

- **Tree browsing** - The tree starts collapsed showing the top-level categories (Abnormality of the nervous system, Abnormality of the cardiovascular system, etc.). Click the arrows to expand branches. Children are loaded on demand from the server.
- **Search** - Type at least 3 characters in the search box. The server finds all matching terms and automatically expands the branches that contain them. Matching text is highlighted in yellow.
- **Selection** - Check the box next to any term to add it to the selection panel on the right. Click the trash icon to remove a selection. Selections are preserved when you search or browse.
- **Counts** - The left panel header shows the total number of terms (or the number of matches during a search). The right panel header shows how many terms are selected.

## How it works

- **Backend**: Python FastAPI server that loads `hp.json` (HPO in OBO Graph JSON format) into memory at startup. The working data is ~3 MB. Three API endpoints handle fetching root nodes, lazy-loading children, and server-side search with ancestor path computation.
- **Frontend**: Vanilla HTML/CSS/JavaScript, no build step or framework.

## Updating the HPO data

To use a newer version of `hp.json`, download it from [HPO releases](https://hpo.jax.org/data/ontology) and replace the `hp.json` file in this directory, then rebuild:

```bash
docker compose build
docker compose up
```

## Running without Docker

Requires Python 3.12+.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000
```

## Project structure

```
main.py              Backend (FastAPI, data loading, 3 API endpoints)
static/index.html    Two-panel UI layout
static/style.css     Styles
static/app.js        Tree rendering, search, selection logic
hp.json              HPO data file (22 MB, OBO Graph JSON)
Dockerfile           Container image definition
docker-compose.yml   One-command deployment
```
