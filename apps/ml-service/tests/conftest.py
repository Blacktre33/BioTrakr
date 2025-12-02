import os
import shutil
import tempfile
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.main import app


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment() -> Generator[None, None, None]:
    """Configure test environment to use temporary directories for MLflow artifacts.
    
    This ensures that tests don't write to system directories or use hardcoded paths,
    preventing PermissionErrors in CI/CD environments like GitHub Actions.
    """
    # Create a temporary directory for all test artifacts
    temp_dir = tempfile.mkdtemp(prefix="biotrakr-ml-test-")
    mlruns_dir = Path(temp_dir) / "mlruns"
    artifacts_dir = Path(temp_dir) / "artifacts"
    
    mlruns_dir.mkdir(parents=True, exist_ok=True)
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    
    # Store original environment variables to restore later
    original_tracking_uri = os.environ.get("MLFLOW_TRACKING_URI")
    original_registry_uri = os.environ.get("MLFLOW_REGISTRY_URI")
    original_artifact_path = os.environ.get("MODEL_LOCAL_ARTIFACT")
    
    # Set test-specific environment variables
    os.environ["MLFLOW_TRACKING_URI"] = f"file:{mlruns_dir}"
    os.environ["MODEL_LOCAL_ARTIFACT"] = str(artifacts_dir / "test-model.joblib")
    # Ensure registry uses the same temp location
    if "MLFLOW_REGISTRY_URI" in os.environ:
        os.environ["MLFLOW_REGISTRY_URI"] = f"file:{mlruns_dir}"
    
    yield
    
    # Restore original environment variables
    if original_tracking_uri:
        os.environ["MLFLOW_TRACKING_URI"] = original_tracking_uri
    elif "MLFLOW_TRACKING_URI" in os.environ:
        del os.environ["MLFLOW_TRACKING_URI"]
        
    if original_registry_uri:
        os.environ["MLFLOW_REGISTRY_URI"] = original_registry_uri
    elif "MLFLOW_REGISTRY_URI" in os.environ:
        del os.environ["MLFLOW_REGISTRY_URI"]
        
    if original_artifact_path:
        os.environ["MODEL_LOCAL_ARTIFACT"] = original_artifact_path
    elif "MODEL_LOCAL_ARTIFACT" in os.environ:
        del os.environ["MODEL_LOCAL_ARTIFACT"]
    
    # Clean up temporary directory
    try:
        shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception:  # noqa: S110
        pass  # Cleanup is best-effort


@pytest.fixture(scope="session")
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client
