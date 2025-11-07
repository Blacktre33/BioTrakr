from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib  # type: ignore[import-untyped]
import mlflow
import mlflow.sklearn
import pandas as pd
import structlog
from mlflow import artifacts
from mlflow.tracking import MlflowClient

from ..core.config import Settings
from ..services.trainer import FEATURE_NAMES_ARTIFACT, train_and_register_model

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class PredictionResult:
    probability: float
    model_version: str
    run_id: str | None


class ModelRepository:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._model: Any | None = None
        self._feature_names: list[str] = []
        self._model_version: str = "unknown"
        self._run_id: str | None = None
        self._load_model()

    def predict(self, features: list[float]) -> PredictionResult:
        if self._model is None:
            raise ValueError("Model is not available for inference")

        if len(features) != len(self._feature_names):
            raise ValueError(
                f"Expected {len(self._feature_names)} features but received {len(features)}"
            )

        # The pipeline expects a 2D array with shape (n_samples, n_features)
        frame = pd.DataFrame([features], columns=self._feature_names)
        probability = float(self._model.predict_proba(frame)[0][1])

        logger.info(
            "prediction.success",
            model_version=self._model_version,
            run_id=self._run_id,
            probability=probability,
        )

        return PredictionResult(
            probability=probability,
            model_version=self._model_version,
            run_id=self._run_id,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _load_model(self) -> None:
        mlflow.set_tracking_uri(self._settings.mlflow_tracking_uri)
        if self._settings.mlflow_registry_uri:
            mlflow.set_registry_uri(self._settings.mlflow_registry_uri)

        if self._try_load_from_registry():
            return

        logger.warning(
            "model.registry_unavailable", model_name=self._settings.model_name, action="bootstrap"
        )
        info = train_and_register_model(self._settings)
        self._model = info.pipeline
        self._feature_names = info.feature_names
        self._model_version = info.model_version
        self._run_id = info.run_id

    def _try_load_from_registry(self) -> bool:
        client = MlflowClient()
        for stage in ("Production", "Staging"):
            try:
                versions = client.get_latest_versions(self._settings.model_name, stages=[stage])
            except mlflow.exceptions.MlflowException:
                return False

            if not versions:
                continue

            version = versions[0]
            model_uri = f"models:/{self._settings.model_name}/{stage}"
            try:
                model = mlflow.sklearn.load_model(model_uri)
                feature_names_raw = artifacts.load_text(
                    artifact_uri=f"runs:/{version.run_id}/{FEATURE_NAMES_ARTIFACT}"
                )
                feature_names = json.loads(feature_names_raw)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "model.load_failed",
                    stage=stage,
                    model_uri=model_uri,
                    error=str(exc),
                )
                continue

            self._model = model
            self._feature_names = list(feature_names)
            self._model_version = str(version.version)
            self._run_id = version.run_id

            local_artifact = Path(self._settings.model_local_artifact)
            local_artifact.parent.mkdir(parents=True, exist_ok=True)
            joblib.dump({"model": model, "feature_names": self._feature_names}, local_artifact)
            feature_artifact = local_artifact.parent / FEATURE_NAMES_ARTIFACT
            feature_artifact.write_text(json.dumps(self._feature_names))

            logger.info(
                "model.loaded",
                model_version=version.version,
                stage=stage,
                run_id=version.run_id,
            )
            return True

        return self._try_load_local_artifact()

    def _try_load_local_artifact(self) -> bool:
        local_artifact = Path(self._settings.model_local_artifact)
        if not local_artifact.exists():
            return False

        payload: dict[str, Any] = joblib.load(local_artifact)
        self._model = payload["model"]
        self._feature_names = list(payload["feature_names"])
        feature_file = local_artifact.parent / FEATURE_NAMES_ARTIFACT
        self._model_version = "local"
        self._run_id = None

        if feature_file.exists():
            try:
                self._feature_names = json.loads(feature_file.read_text())
            except json.JSONDecodeError:
                pass

        logger.info("model.loaded_local", artifact=str(local_artifact))
        return True
