"""
Dataset Loader for External Open-Source Datasets

This module provides utilities for loading and preprocessing external datasets
for transfer learning and model pre-training. Integrates with BioTrakr's
telemetry labeling standards and ML training pipeline.

See docs/ml-datasets-guide.md for dataset sources and download links.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .data_loader import TrainingData


class DatasetSource(str, Enum):
    """Supported external dataset sources."""

    NASA_CMAPSS = "nasa_cmapss"
    AZURE_PM = "azure_pm"
    CWRU_BEARING = "cwru_bearing"
    NAVAL_PROPULSION = "naval_propulsion"
    SYNTHETIC = "synthetic"  # Fallback to existing synthetic generator


@dataclass(frozen=True)
class DatasetMetadata:
    """Metadata about a loaded dataset."""

    source: DatasetSource
    num_samples: int
    num_features: int
    feature_names: list[str]
    label_distribution: dict[str, int]
    description: str


class DatasetLoader:
    """
    Loader for external datasets with preprocessing and label mapping.

    Maps external dataset formats to BioTrakr's TrainingData structure
    and applies labeling standards from the Telemetry Labeling Guide.
    """

    def __init__(self, data_dir: Path | None = None):
        """
        Initialize dataset loader.

        Args:
            data_dir: Optional directory containing downloaded datasets.
                     If None, expects datasets in standard locations.
        """
        self.data_dir = data_dir or Path(__file__).parent.parent.parent / "data" / "raw"

    def load_dataset(
        self,
        source: DatasetSource,
        **kwargs: Any,
    ) -> tuple[TrainingData, DatasetMetadata]:
        """
        Load a dataset from the specified source.

        Args:
            source: Dataset source identifier
            **kwargs: Source-specific loading parameters

        Returns:
            Tuple of (TrainingData, DatasetMetadata)

        Raises:
            ValueError: If dataset source is not supported or data not found
        """
        if source == DatasetSource.NASA_CMAPSS:
            return self._load_nasa_cmapss(**kwargs)
        elif source == DatasetSource.AZURE_PM:
            return self._load_azure_pm(**kwargs)
        elif source == DatasetSource.CWRU_BEARING:
            return self._load_cwru_bearing(**kwargs)
        elif source == DatasetSource.NAVAL_PROPULSION:
            return self._load_naval_propulsion(**kwargs)
        elif source == DatasetSource.SYNTHETIC:
            from .data_loader import generate_synthetic_dataset

            data = generate_synthetic_dataset(**kwargs)
            metadata = DatasetMetadata(
                source=source,
                num_samples=len(data.features),
                num_features=len(data.feature_names),
                feature_names=data.feature_names,
                label_distribution=data.labels.value_counts().to_dict(),
                description="Synthetic dataset for bootstrap training",
            )
            return data, metadata
        else:
            raise ValueError(f"Unsupported dataset source: {source}")

    def _load_nasa_cmapss(
        self,
        subset: str = "FD001",
        data_dir: Path | None = None,
    ) -> tuple[TrainingData, DatasetMetadata]:
        """
        Load NASA C-MAPSS turbofan engine degradation dataset.

        Args:
            subset: Dataset subset (FD001, FD002, FD003, or FD004)
            data_dir: Optional directory containing C-MAPSS data

        Returns:
            Tuple of (TrainingData, DatasetMetadata)

        Note:
            Dataset must be downloaded and extracted first.
            See docs/ml-datasets-guide.md for download link.
        """
        data_path = (data_dir or self.data_dir) / "nasa_cmapss" / subset

        if not data_path.exists():
            raise FileNotFoundError(
                f"C-MAPSS dataset not found at {data_path}. "
                "Download from: https://phm-datasets.s3.amazonaws.com/NASA/"
                "6.+Turbofan+Engine+Degradation+Simulation+Data+Set.zip"
            )

        # Load training data (simplified - actual C-MAPSS has complex structure)
        # This is a placeholder implementation
        # Full implementation would parse the C-MAPSS text files
        train_file = data_path / f"train_{subset}.txt"
        if not train_file.exists():
            raise FileNotFoundError(f"Training file not found: {train_file}")

        # Placeholder: actual implementation would parse C-MAPSS format
        # C-MAPSS has 21 sensor columns + unit ID + cycle number
        # For now, return empty dataset with expected structure
        features = pd.DataFrame()
        labels = pd.Series(dtype=int)

        return (
            TrainingData(features=features, labels=labels, feature_names=[]),
            DatasetMetadata(
                source=DatasetSource.NASA_CMAPSS,
                num_samples=0,
                num_features=0,
                feature_names=[],
                label_distribution={},
                description=f"NASA C-MAPSS Turbofan Engine Degradation ({subset})",
            ),
        )

    def _load_azure_pm(
        self,
        data_dir: Path | None = None,
    ) -> tuple[TrainingData, DatasetMetadata]:
        """
        Load Microsoft Azure Predictive Maintenance dataset.

        Args:
            data_dir: Optional directory containing Azure PM data

        Returns:
            Tuple of (TrainingData, DatasetMetadata)

        Note:
            Dataset must be downloaded from Kaggle first.
            See docs/ml-datasets-guide.md for download link.
        """
        data_path = data_dir or self.data_dir / "azure_pm"

        if not data_path.exists():
            raise FileNotFoundError(
                f"Azure PM dataset not found at {data_path}. "
                "Download from: https://www.kaggle.com/datasets/"
                "arnabbiswas1/microsoft-azure-predictive-maintenance"
            )

        # Load telemetry data
        telemetry_file = data_path / "telemetry.csv"
        if not telemetry_file.exists():
            raise FileNotFoundError(f"Telemetry file not found: {telemetry_file}")

        # Placeholder: actual implementation would load and preprocess CSV
        features = pd.DataFrame()
        labels = pd.Series(dtype=int)

        return (
            TrainingData(features=features, labels=labels, feature_names=[]),
            DatasetMetadata(
                source=DatasetSource.AZURE_PM,
                num_samples=0,
                num_features=0,
                feature_names=[],
                label_distribution={},
                description="Microsoft Azure Predictive Maintenance Dataset",
            ),
        )

    def _load_cwru_bearing(
        self,
        data_dir: Path | None = None,
    ) -> tuple[TrainingData, DatasetMetadata]:
        """
        Load CWRU Bearing fault dataset.

        Args:
            data_dir: Optional directory containing CWRU data

        Returns:
            Tuple of (TrainingData, DatasetMetadata)

        Note:
            Dataset must be downloaded from Kaggle first.
            See docs/ml-datasets-guide.md for download link.
        """
        data_path = data_dir or self.data_dir / "cwru_bearing"

        if not data_path.exists():
            raise FileNotFoundError(
                f"CWRU Bearing dataset not found at {data_path}. "
                "Download from: https://www.kaggle.com/datasets/brjapon/cwru-bearing-datasets"
            )

        # Placeholder: actual implementation would load vibration signals
        features = pd.DataFrame()
        labels = pd.Series(dtype=int)

        return (
            TrainingData(features=features, labels=labels, feature_names=[]),
            DatasetMetadata(
                source=DatasetSource.CWRU_BEARING,
                num_samples=0,
                num_features=0,
                feature_names=[],
                label_distribution={},
                description="CWRU Bearing Fault Dataset",
            ),
        )

    def _load_naval_propulsion(
        self,
        data_dir: Path | None = None,
    ) -> tuple[TrainingData, DatasetMetadata]:
        """
        Load UCI Naval Propulsion Plant dataset.

        Args:
            data_dir: Optional directory containing naval propulsion data

        Returns:
            Tuple of (TrainingData, DatasetMetadata)

        Note:
            Dataset must be downloaded from UCI first.
            See docs/ml-datasets-guide.md for download link.
        """
        data_path = data_dir or self.data_dir / "naval_propulsion"

        if not data_path.exists():
            raise FileNotFoundError(
                f"Naval Propulsion dataset not found at {data_path}. "
                "Download from: http://archive.ics.uci.edu/ml/datasets/"
                "condition+based+maintenance+of+naval+propulsion+plants"
            )

        # Placeholder: actual implementation would load UCI format
        features = pd.DataFrame()
        labels = pd.Series(dtype=int)

        return (
            TrainingData(features=features, labels=labels, feature_names=[]),
            DatasetMetadata(
                source=DatasetSource.NAVAL_PROPULSION,
                num_samples=0,
                num_features=0,
                feature_names=[],
                label_distribution={},
                description="UCI Naval Propulsion Plant Dataset",
            ),
        )

    @staticmethod
    def map_rul_to_health_status(rul_cycles: int) -> str:
        """
        Map Remaining Useful Life (RUL) cycles to BioTrakr health status.

        This follows the labeling standards from the Telemetry Labeling Guide.

        Args:
            rul_cycles: Remaining useful life in cycles

        Returns:
            Health status string: 'critical', 'poor', 'fair', 'good', or 'excellent'
        """
        if rul_cycles <= 30:
            return "critical"
        elif rul_cycles <= 50:
            return "poor"
        elif rul_cycles <= 100:
            return "fair"
        elif rul_cycles <= 150:
            return "good"
        else:
            return "excellent"

    @staticmethod
    def map_health_score_to_status(score: float) -> str:
        """
        Map health score (0-100) to health status category.

        Args:
            score: Health score from 0 to 100

        Returns:
            Health status string
        """
        if score <= 20:
            return "critical"
        elif score <= 40:
            return "poor"
        elif score <= 60:
            return "fair"
        elif score <= 80:
            return "good"
        else:
            return "excellent"

