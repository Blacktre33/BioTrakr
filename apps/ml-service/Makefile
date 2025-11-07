.PHONY: install lint format test run train

POETRY?=/Users/saketh/Library/Python/3.13/bin/poetry

install:
	$(POETRY) install

lint:
	$(POETRY) run ruff check src tests
	$(POETRY) run mypy src

format:
	$(POETRY) run ruff check --select I --fix src tests
	$(POETRY) run ruff format src tests

test:
	$(POETRY) run pytest --cov=src --cov-report=term-missing

run:
	$(POETRY) run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

train:
	$(POETRY) run python -m src.services.trainer
