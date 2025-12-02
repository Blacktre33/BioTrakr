# BioTrakr Machine Learning Service

The ML microservice powers predictive maintenance and asset risk scoring. It provides APIs for online inference and utilities for offline training using MLflow for experiment tracking and model registry.

## Prerequisites

- Python 3.11+
- `poetry` available on PATH (`/Users/saketh/Library/Python/3.13/bin/poetry` in this workspace)
- Local Postgres/TimescaleDB and Redis from the main docker-compose stack (optional for synthetic training)

## Setup

```bash
cd apps/ml-service
poetry install
```

Copy the environment template and adjust as needed:

```bash
cp .env.example .env
```

## Running the Service

```bash
poetry run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

The API exposes:

- `GET /health` – heartbeat
- `POST /inference/predict-failure` – returns failure probability given feature vector
- `POST /training/trigger` – retrains the baseline model and registers it via MLflow

API docs are available at `http://localhost:8000/docs` when running locally.

## Testing & Linting

```bash
# unit tests
poetry run pytest

# linting & type checks
poetry run ruff check src tests
poetry run mypy src
```

A convenience Makefile is provided:

```bash
make install
make run
make test
make lint
make train
```

## MLflow Integration

By default the service logs to a local MLflow store at `file:./mlruns`. Adjust `MLFLOW_TRACKING_URI` / `MLFLOW_REGISTRY_URI` in `.env` to point at a shared tracking server when available.

The fallback behaviour:

1. Attempt to load the latest `Production` model from MLflow registry.
2. If unavailable, load the most recent local artifact (`artifacts/latest-model.joblib`).
3. If neither exists, bootstrap a synthetic dataset and train a baseline model, logging the run to MLflow.

## Project Structure

```
src/
  api/            # FastAPI routes
  core/           # configuration & logging
  models/         # model registry + inference helpers
  schemas/        # Pydantic schemas
  services/       # data loading & training pipelines
```

## Next Steps

- Integrate with real telemetry and TimescaleDB queries in `services/data_loader`.
- Wire Celery/worker queues for asynchronous training.
- Add model monitoring hooks (drift detection, inference metrics).

## Docker & Compose

```bash
# build and run via docker-compose
docker-compose up ml-service

# or build the image directly
docker build -t biotrakr-ml-service apps/ml-service
docker run --rm -p 8000:8000 --env-file apps/ml-service/.env biotrakr-ml-service
```

The Compose file also starts an MLflow tracking server on http://localhost:5001.
