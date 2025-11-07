from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import joblib  # type: ignore[import-untyped]
import mlflow
import mlflow.sklearn
import structlog
from mlflow.models import infer_signature
from mlflow.tracking import MlflowClient
from sklearn.ensemble import GradientBoostingClassifier  # type: ignore[import-untyped]
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score  # type: ignore[import-untyped]
from sklearn.pipeline import Pipeline  # type: ignore[import-untyped]
from sklearn.preprocessing import StandardScaler  # type: ignore[import-untyped]

from ..core.config import Settings
from .data_loader import TrainingData, generate_synthetic_dataset

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class TrainedModelInfo:
    pipeline: Pipeline
    feature_names: list[str]
    run_id: str
    model_version: str
    metrics: dict[str, float]


FEATURE_NAMES_ARTIFACT = "feature_names.json"


def _build_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            ("scale", StandardScaler()),
            (
                "classifier",
                GradientBoostingClassifier(
                    n_estimators=200,
                    learning_rate=0.05,
                    max_depth=3,
                    subsample=0.9,
                    random_state=42,
                ),
            ),
        ]
    )


def train_and_register_model(
    settings: Settings, data: TrainingData | None = None
) -> TrainedModelInfo:
    """Train a baseline model and register it via MLflow."""
    mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
    if settings.mlflow_registry_uri:
        mlflow.set_registry_uri(settings.mlflow_registry_uri)

    dataset = data or generate_synthetic_dataset()
    pipeline = _build_pipeline()
    pipeline.fit(dataset.features, dataset.labels)

    probabilities = pipeline.predict_proba(dataset.features)[:, 1]
    predictions = (probabilities >= 0.5).astype(int)

    metrics = {
        "auc": float(roc_auc_score(dataset.labels, probabilities)),
        "accuracy": float(accuracy_score(dataset.labels, predictions)),
        "f1": float(f1_score(dataset.labels, predictions)),
    }

    feature_dir = Path(settings.model_local_artifact).parent
    feature_dir.mkdir(parents=True, exist_ok=True)
    feature_file = feature_dir / FEATURE_NAMES_ARTIFACT
    feature_file.write_text(json.dumps(dataset.feature_names))

    joblib.dump(
        {"model": pipeline, "feature_names": dataset.feature_names},
        settings.model_local_artifact,
    )

    logger.info("training.metrics", **metrics)

    with mlflow.start_run(run_name="baseline-training") as run:
        mlflow.log_params({
            "n_features": len(dataset.feature_names),
            "algorithm": "gradient_boosting",
        })
        mlflow.log_metrics(metrics)
        mlflow.log_text(json.dumps(dataset.feature_names), FEATURE_NAMES_ARTIFACT)

        mlflow.sklearn.log_model(
            sk_model=pipeline,
            artifact_path="model",
            registered_model_name=settings.model_name,
            input_example=dataset.features.iloc[:1],
            signature=infer_signature(dataset.features, predictions),
        )

        client = MlflowClient()
        versions = client.get_latest_versions(settings.model_name)
        version_match = next((mv for mv in versions if mv.run_id == run.info.run_id), None)
        model_version = version_match or versions[-1]
        client.transition_model_version_stage(
            name=settings.model_name,
            version=model_version.version,
            stage="Production",
            archive_existing_versions=True,
        )

    logger.info(
        "training.completed",
        model_version=model_version.version,
        run_id=run.info.run_id,
    )

    return TrainedModelInfo(
        pipeline=pipeline,
        feature_names=dataset.feature_names,
        run_id=run.info.run_id,
        model_version=str(model_version.version),
        metrics=metrics,
    )


if __name__ == "__main__":
    from ..core.config import get_settings

    settings = get_settings()
    train_and_register_model(settings)
