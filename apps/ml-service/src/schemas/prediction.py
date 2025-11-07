from typing import List

from pydantic import BaseModel, Field


class FailurePredictionRequest(BaseModel):
    asset_id: str = Field(..., description="Unique asset identifier")
    features: List[float] = Field(..., min_items=1, description="Feature vector for prediction")


class FailurePrediction(BaseModel):
    probability: float = Field(..., ge=0, le=1)
    model_version: str
    run_id: str | None = None


class FailurePredictionResponse(BaseModel):
    asset_id: str
    prediction: FailurePrediction
