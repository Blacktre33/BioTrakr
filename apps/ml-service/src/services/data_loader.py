from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class TrainingData:
    features: pd.DataFrame
    labels: pd.Series
    feature_names: list[str]


def generate_synthetic_dataset(num_samples: int = 500, random_state: int = 42) -> TrainingData:
    """Generate a reproducible synthetic dataset for bootstrap training."""
    rng = np.random.default_rng(seed=random_state)

    feature_names = [
        "usage_hours_last_week",
        "maintenance_overdue_days",
        "temperature_avg",
        "vibration_score",
        "age_years",
    ]

    X = pd.DataFrame(
        data={
            "usage_hours_last_week": rng.normal(loc=32, scale=8, size=num_samples).clip(min=0),
            "maintenance_overdue_days": rng.poisson(lam=3, size=num_samples),
            "temperature_avg": rng.normal(loc=21, scale=3, size=num_samples),
            "vibration_score": rng.normal(loc=0.4, scale=0.15, size=num_samples).clip(0, 1),
            "age_years": rng.normal(loc=5, scale=2.5, size=num_samples).clip(min=0.5),
        }
    )

    failure_base = (
        0.3 * (X["usage_hours_last_week"] > 40).astype(float)
        + 0.25 * (X["maintenance_overdue_days"] > 5).astype(float)
        + 0.2 * (X["vibration_score"] > 0.6).astype(float)
        + 0.15 * (X["age_years"] > 8).astype(float)
        + rng.normal(scale=0.1, size=num_samples)
    )
    probability = 1 / (1 + np.exp(-failure_base))
    y = pd.Series((probability > 0.55).astype(int), name="failed_within_30d")

    return TrainingData(features=X, labels=y, feature_names=feature_names)
