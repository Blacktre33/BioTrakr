import structlog
from fastapi import APIRouter, Depends

from ...core.config import Settings, get_settings
from ...schemas.training import TrainingResponse
from ...services.data_loader import generate_synthetic_dataset
from ...services.trainer import train_and_register_model

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/training", tags=["Training"])


@router.post("/trigger", response_model=TrainingResponse)
def trigger_training(
    settings: Settings = Depends(get_settings),  # noqa: B008
) -> TrainingResponse:
    dataset = generate_synthetic_dataset()
    info = train_and_register_model(settings=settings, data=dataset)

    logger.info("training.triggered", model_version=info.model_version, run_id=info.run_id)

    return TrainingResponse(
        model_version=info.model_version,
        run_id=info.run_id,
        auc=info.metrics.get("auc", 0.0),
        accuracy=info.metrics.get("accuracy", 0.0),
        f1=info.metrics.get("f1", 0.0),
    )
