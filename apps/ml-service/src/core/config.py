from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    api_title: str = "BioTrakr ML Service"
    api_version: str = "0.1.0"

    database_url: str = Field(
        default="postgresql://postgres:postgres@localhost:5433/biotrakr_dev",
        description="Primary PostgreSQL/TimescaleDB connection for feature extraction.",
    )
    mlflow_tracking_uri: str = Field(
        default="file:./mlruns",
        description="MLflow tracking URI used for experiments and model registry.",
    )
    mlflow_registry_uri: str | None = Field(
        default=None,
        description="Optional MLflow model registry URI if different from tracking.",
    )
    model_name: str = Field(
        default="biotrakr-failure-risk",
        description="Registered model name used for inference and version management.",
    )
    model_local_artifact: str = Field(
        default="artifacts/latest-model.joblib",
        description="Fallback path where the latest trained model artifact is stored locally.",
    )
    log_level: str = Field(default="INFO")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
