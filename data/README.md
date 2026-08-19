# ORION — Archivist Paper Sources

This directory contains the curated arXiv astrophysics PDFs used by the Archivist RAG pipeline.

PDFs live in `./pdfs/` and are ingested into the Chroma vector store at `./chroma_db/` by running:

```bash
python scripts/ingest_pdfs.py
```

---

## Curated Papers

### Near-Earth Objects / Asteroids

| arXiv ID | Filename | Title / Description |
|----------|----------|---------------------|
| [2301.05916](https://arxiv.org/abs/2301.05916) | `nea_survey_review__2301.05916.pdf` | Near-Earth asteroid survey review — current detection completeness, orbital distribution, and future survey strategies |
| [2009.01844](https://arxiv.org/abs/2009.01844) | `neo_population_model__2009.01844.pdf` | NEO population orbital model — statistical characterisation of the near-Earth object population via debiased orbital models |
| [1905.02983](https://arxiv.org/abs/1905.02983) | `asteroid_hazard_mitigation__1905.02983.pdf` | Asteroid hazard and deflection strategies — impact risk assessment and mitigation concepts including kinetic impactors and gravity tractors |

### Solar Flares / Space Weather

| arXiv ID | Filename | Title / Description |
|----------|----------|---------------------|
| [2209.00789](https://arxiv.org/abs/2209.00789) | `solar_flare_forecasting_ml__2209.00789.pdf` | ML-based solar flare forecasting — machine learning approaches for probabilistic flare prediction using GOES and HMI data |
| [2101.08502](https://arxiv.org/abs/2101.08502) | `solar_flare_prediction_cnn__2101.08502.pdf` | CNN for solar flare prediction — convolutional neural network models trained on active region magnetograms |
| [1912.08596](https://arxiv.org/abs/1912.08596) | `solar_energetic_particles__1912.08596.pdf` | Solar energetic particle events — characterisation of SEP events associated with solar flares and coronal mass ejections |

### General Astrophysics

| arXiv ID | Filename | Title / Description |
|----------|----------|---------------------|
| [2112.03863](https://arxiv.org/abs/2112.03863) | `jwst_early_universe__2112.03863.pdf` | JWST early-universe observations — early science results from the James Webb Space Telescope on high-redshift galaxy formation |
| [2204.05243](https://arxiv.org/abs/2204.05243) | `astrophysics_llm_survey__2204.05243.pdf` | NLP and ML in astrophysics survey — review of machine learning applications in astrophysical data analysis and literature mining |

---

## Ingestion Stats (last run)

| Metric | Value |
|--------|-------|
| PDFs parsed | 8 |
| Total chunks | 939 |
| Chunk size | 512 characters |
| Chunk overlap | 64 characters |
| Embedding model | `sentence-transformers/all-MiniLM-L6-v2` |
| Chroma collection | `archivist` |
| Chroma path | `./chroma_db/` |

---

## arXiv Bulk Access

These PDFs were retrieved via the public arXiv PDF endpoint (`https://arxiv.org/pdf/<id>.pdf`).
All papers are open-access pre-prints. In accordance with arXiv's [bulk access policy](https://arxiv.org/help/bulk_data),
access is rate-limited to 1 request per second in `scripts/download_pdfs.py`.

---

## Re-ingesting

To re-download and re-ingest (e.g. after adding more papers):

```bash
python scripts/download_pdfs.py   # downloads PDFs to ./data/pdfs/
python scripts/ingest_pdfs.py     # re-builds the Chroma collection from scratch
```
