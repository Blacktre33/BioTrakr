from fastapi import APIRouter, Depends, HTTPException
import structlog

from ...core.config import Settings, get_settings
from ...models.registry import ModelRepository
from ...schemas.prediction import (
    FailurePrediction,
    FailurePredictionRequest,
    FailurePredictionResponse,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/inference", tags=["Inference"])


def get_repository(settings: Settings = Depends(get_settings)) -> ModelRepository:
    return ModelRepository(settings=settings)


@router.post("/predict-failure", response_model=FailurePredictionResponse)
def predict_failure(
    payload: FailurePredictionRequest,
    repository: ModelRepository = Depends(get_repository),
) -> FailurePredictionResponse:
    try:
        prediction = repository.predict(payload.features)
    except ValueError as exc:
        logger.warning("prediction.failed", asset_id=payload.asset_id, exc_info=exc)
        raise HTTPException(status_code=400, detail=str(exc))

    return FailurePredictionResponse(
        asset_id=payload.asset_id,
        prediction=FailurePrediction(
            probability=prediction.probability,
            model_version=prediction.model_version,
            run_id=prediction.run_id,
        ),
    )
