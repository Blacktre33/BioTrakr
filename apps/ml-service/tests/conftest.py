import os
import tempfile
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.main import app


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment() -> Generator[None, None, None]:
    """Configure test environment to use temporary directories for MLflow artifacts."""
    temp_dir = tempfile.mkdtemp(prefix="medasset-ml-test-")
    mlruns_dir = Path(temp_dir) / "mlruns"
    artifacts_dir = Path(temp_dir) / "artifacts"
    
    mlruns_dir.mkdir(parents=True, exist_ok=True)
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    
    os.environ["MLFLOW_TRACKING_URI"] = f"file:{mlruns_dir}"
    os.environ["MODEL_LOCAL_ARTIFACT"] = str(artifacts_dir / "test-model.joblib")
    
    yield
    
    # Cleanup is optional; temp dirs are typically cleaned by the OS


@pytest.fixture(scope="session")
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client
