# syntax=docker/dockerfile:1.4

FROM python:3.11-slim AS base

ENV POETRY_HOME="/opt/poetry" \
    POETRY_VERSION="2.2.1" \
    POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    PYTHONUNBUFFERED=1

RUN apt-get update \ 
    && apt-get install -y --no-install-recommends build-essential curl \ 
    && rm -rf /var/lib/apt/lists/* \ 
    && pip install --no-cache-dir "poetry==${POETRY_VERSION}"

WORKDIR /app

COPY pyproject.toml poetry.lock* ./
RUN poetry install --only main --no-root

COPY src ./src
COPY .env.example ./

EXPOSE 8000

CMD ["poetry", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
