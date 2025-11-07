from pydantic import BaseModel, Field


class TrainingResponse(BaseModel):
    model_version: str
    run_id: str
    auc: float = Field(..., ge=0, le=1)
    accuracy: float = Field(..., ge=0, le=1)
    f1: float = Field(..., ge=0, le=1)
