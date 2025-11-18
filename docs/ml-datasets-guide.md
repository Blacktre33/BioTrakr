# Open-Source Datasets for BioTrakr ML Model Training

## Overview

This guide provides a curated list of open-source datasets that can be used to improve the reliability of BioTrakr's predictive maintenance and telemetry ML models. These datasets are categorized by their primary use case and include direct download links where available.

---

## 1. Predictive Maintenance Datasets

### 1.1 NASA Prognostics Data Repository

The gold standard for predictive maintenance research with multiple run-to-failure datasets.

#### Turbofan Engine Degradation (C-MAPSS)

- **Description:** Simulated run-to-failure data from turbofan engines with 21 sensor channels, multiple operating conditions, and fault modes

- **Use Case:** RUL prediction, health index modeling, degradation pattern recognition

- **Size:** 4 sub-datasets (FD001-FD004), 100-248 engines each

- **Features:** Temperature, pressure, speed, vibration sensors

- **Labels:** Remaining Useful Life (RUL)

- **Download:** https://phm-datasets.s3.amazonaws.com/NASA/6.+Turbofan+Engine+Degradation+Simulation+Data+Set.zip

- **Citation:** A. Saxena and K. Goebel (2008). "Turbofan Engine Degradation Simulation Data Set", NASA Prognostics Data Repository

#### Battery Degradation Dataset

- **Description:** Battery cycling data with randomized usage profiles

- **Use Case:** Capacity degradation prediction, cycle life estimation

- **Download:** NASA Prognostics Repository

- **Citation:** B. Bole, C. Kulkarni, and M. Daigle "Randomized Battery Usage Data Set"

#### Bearing Degradation (FEMTO)

- **Description:** Accelerated life test data from bearings

- **Use Case:** Bearing fault detection, vibration analysis

- **Download:** NASA Prognostics Repository

- **Citation:** P. Nectoux et al., PRONOSTIA: An Experimental Platform for Bearings Accelerated Life Test

**Repository URL:** https://www.nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository/

---

### 1.2 Microsoft Azure Predictive Maintenance Dataset

Comprehensive synthetic dataset designed for end-to-end predictive maintenance solutions.

- **Description:** Simulated telemetry from 100 machines over 1 year

- **Components:**

  - **Telemetry:** Hourly voltage, rotation, pressure, vibration (876,099 rows)

  - **Errors:** Non-failure error events with timestamps

  - **Maintenance:** Proactive and reactive maintenance records

  - **Failures:** Component replacement due to failures

  - **Machines:** Metadata (model type, age)

- **Use Case:** Multi-class failure prediction, time-to-failure estimation

- **Download:** https://www.kaggle.com/datasets/arnabbiswas1/microsoft-azure-predictive-maintenance

- **GitHub Template:** https://github.com/Azure/AI-PredictiveMaintenance

**Relevance to BioTrakr:** Excellent for pre-training models on equipment failure patterns before fine-tuning on medical equipment data.

---

### 1.3 PHM Society Data Challenge Datasets

Annual competition datasets covering diverse industrial systems.

#### Gearbox Fault Detection (2023)

- **Description:** Accelerometer data for fault detection in gearboxes

- **Task:** Fault type, location, and magnitude estimation

- **Signals:** Vibration, speed

- **URL:** https://data.phmsociety.org/

#### Helicopter Turbine Engines (2024)

- **Description:** Health assessment of turbine engines

- **Signals:** Temperature, power, speed, torque

- **Task:** Fault detection, health scoring

- **URL:** https://data.phmsociety.org/phm2024-conference-data-challenge/

#### Ion Mill Etch Tool (2018)

- **Description:** Wafer manufacturing equipment degradation

- **Use Case:** Semiconductor equipment maintenance

**Repository URL:** https://data.phmsociety.org/

---

### 1.4 Bearing Datasets

#### CWRU Bearing Dataset

- **Description:** Case Western Reserve University bearing fault data

- **Signals:** Vibration at drive end, fan end, and base

- **Fault Types:** Inner race, outer race, ball faults

- **Download:** https://www.kaggle.com/datasets/brjapon/cwru-bearing-datasets

#### MFPT Bearing Data

- **Description:** Condition-based maintenance fault data

- **Signals:** Vibration

- **Task:** Diagnosis

- **Source:** Machinery Failure Prevention Technology Society

---

### 1.5 Additional Industrial Datasets

#### Condition Based Maintenance of Naval Propulsion Plants

- **Description:** UCI dataset for naval vessel propulsion system

- **Features:** 16 sensor measurements

- **Target:** Gas turbine and compressor decay coefficients

- **Download:** http://archive.ics.uci.edu/ml/datasets/condition+based+maintenance+of+naval+propulsion+plants

#### Production Plant Data for Condition Monitoring

- **Description:** Industrial production plant sensor data

- **Download:** https://www.kaggle.com/datasets/inIT-OWL/production-plant-data-for-condition-monitoring

#### One Year Industrial Component Degradation

- **Description:** Long-term degradation monitoring data

- **Download:** https://www.kaggle.com/datasets/inIT-OWL/one-year-industrial-component-degradation

---

## 2. Healthcare & Medical Equipment Datasets

### 2.1 MIMIC (Medical Information Mart for Intensive Care)

The most comprehensive open healthcare database, highly relevant for BioTrakr's healthcare context.

#### MIMIC-IV (Latest Version)

- **Description:** De-identified health data from ICU patients at Beth Israel Deaconess Medical Center (2008-2019)

- **Contents:**

  - Vital signs from bedside monitors

  - Laboratory measurements

  - Medications and IV drip rates

  - Procedure codes

  - Clinical notes

  - Equipment event logs

- **Size:** ~300,000+ patient admissions

- **Equipment Data:** Time-stamped physiological measurements from Philips CareVue and iMDsoft MetaVision systems

- **Access:** Requires credentialing through PhysioNet

- **URL:** https://physionet.org/content/mimiciv/

**Relevance to BioTrakr:** 

- ICU equipment sensor patterns and failure modes

- Clinical workflow integration patterns

- Healthcare-specific telemetry formats

- HIPAA-compliant data handling examples

#### MIMIC-III Waveform Database

- **Description:** High-resolution physiological waveforms

- **Signals:** ECG, ABP, respiration, SpO2

- **URL:** https://physionet.org/content/mimic3wdb/

---

### 2.2 CT Equipment Predictive Maintenance

- **Description:** Research on predicting CT scanner anomalies

- **Signals:** Current, tube scanning time, temperature

- **Task:** Arcing prediction, tube failure forecasting

- **Reference:** "Healthcare facilities management: A novel data-driven model for predictive maintenance of computed tomography equipment" (ScienceDirect)

---

## 3. Aggregated Dataset Collections

### 3.1 PHMD Python Library

A comprehensive Python library providing unified access to 59 PHM datasets.

- **Installation:** `pip install phmd`

- **Features:**

  - Standardized data formats

  - Built-in preprocessing

  - Task-specific experiment settings

  - Metadata handling

- **GitHub:** https://github.com/dasolma/phmd

- **Paper:** https://www.sciencedirect.com/science/article/pii/S2352711025000068

**Usage Example:**

```python
from phmd import PHMD

# Load NASA turbofan dataset
dataset = PHMD.load('nasa_turbofan')
X_train, y_train = dataset.get_training_data()
```

---

### 3.2 Curated GitHub Repositories

#### kokikwbt/predictive-maintenance

- **Description:** Collection of PM datasets with Jupyter notebooks

- **Datasets:** NASA, CWRU, Battery degradation, and more

- **URL:** https://github.com/kokikwbt/predictive-maintenance

#### hustcxl/PHM_datasets

- **Description:** PHM-related datasets with documentation

- **URL:** https://github.com/hustcxl/PHM_datasets

#### jonathanwvd/awesome-industrial-datasets

- **Description:** Curated collection of industrial datasets

- **URL:** https://github.com/jonathanwvd/awesome-industrial-datasets

---

## 4. Dataset Selection Strategy for BioTrakr

### 4.1 Pre-training Phase

Use large, general-purpose datasets to learn fundamental degradation patterns:

| Dataset | Purpose | Priority |
|---------|---------|----------|
| NASA C-MAPSS Turbofan | Multi-sensor degradation patterns, RUL estimation | HIGH |
| Azure Predictive Maintenance | Multi-component failure prediction | HIGH |
| CWRU Bearing | Vibration analysis fundamentals | MEDIUM |

### 4.2 Domain Adaptation Phase

Fine-tune with healthcare-relevant datasets:

| Dataset | Purpose | Priority |
|---------|---------|----------|
| MIMIC-IV | Healthcare equipment telemetry patterns | HIGH |
| MIMIC Waveforms | Medical sensor signal processing | MEDIUM |

### 4.3 Task-Specific Training

Target specific BioTrakr capabilities:

| Capability | Recommended Datasets |
|------------|---------------------|
| Failure prediction | C-MAPSS, Azure PM, PHM challenges |
| Health scoring | C-MAPSS (RUL), Naval propulsion |
| Anomaly detection | MIMIC (vital signs), Battery degradation |
| Multi-sensor fusion | Azure PM, C-MAPSS (21 sensors) |

---

## 5. Implementation Approach

### 5.1 Transfer Learning Pipeline

```python
# Pseudo-code for transfer learning approach

# Step 1: Pre-train on large industrial datasets
base_model = train_on_dataset(
    datasets=['nasa_cmapss', 'azure_pm'],
    task='degradation_prediction'
)

# Step 2: Domain adaptation with healthcare data
adapted_model = fine_tune(
    base_model,
    dataset='mimic_equipment_events',
    task='medical_equipment_health'
)

# Step 3: Task-specific fine-tuning
final_model = fine_tune(
    adapted_model,
    dataset='biotrakr_internal_data',
    task='specific_equipment_type'
)
```

### 5.2 Data Augmentation Strategies

When internal data is limited, use these techniques:

1. **Synthetic minority oversampling** for rare failure events
2. **Time-series augmentation** (jittering, scaling, warping)
3. **Transfer learning** from similar equipment types
4. **Physics-informed constraints** based on equipment specifications

### 5.3 Labeling Strategy

Map external dataset labels to BioTrakr's schema:

```python
# Example: Map C-MAPSS RUL to BioTrakr health status
def map_rul_to_health_status(rul_cycles):
    if rul_cycles <= 30:
        return 'critical'
    elif rul_cycles <= 50:
        return 'poor'
    elif rul_cycles <= 100:
        return 'fair'
    elif rul_cycles <= 150:
        return 'good'
    else:
        return 'excellent'
```

---

## 6. Dataset Quality Considerations

### 6.1 Evaluation Criteria

| Criterion | Questions to Ask |
|-----------|-----------------|
| **Relevance** | Does sensor type match medical equipment? |
| **Size** | Enough samples for deep learning? |
| **Balance** | Ratio of normal vs failure instances? |
| **Labeling** | Quality of RUL/failure annotations? |
| **Noise** | Realistic sensor noise levels? |

### 6.2 Known Limitations

- **C-MAPSS:** Simulated, not real sensor data
- **Azure PM:** Synthetic, may not capture all failure modes
- **MIMIC:** Patient-focused, limited equipment maintenance labels
- **Bearing datasets:** Single component, not system-level

### 6.3 Bridging the Gap

To address limitations:

1. **Combine multiple datasets** to increase diversity
2. **Add domain knowledge** through physics-informed models
3. **Validate on internal data** before deployment
4. **Implement continuous learning** from production data

---

## 7. Compliance Considerations

### 7.1 Dataset Licenses

| Dataset | License | Commercial Use |
|---------|---------|----------------|
| NASA Prognostics | Public domain | ✅ Yes |
| Azure PM | MIT | ✅ Yes |
| MIMIC | PhysioNet Credentialed | ⚠️ Requires DUA |
| CWRU | Academic | ⚠️ Check terms |
| PHM Society | Varies | ⚠️ Check each |

### 7.2 MIMIC Access Requirements

1. Complete CITI training course
2. Sign Data Use Agreement
3. Get credentialed on PhysioNet
4. Follow de-identification protocols

**Important:** Even though MIMIC is de-identified, BioTrakr should treat it with the same care as PHI for compliance practice.

---

## 8. Quick Start Recommendations

### For Immediate Use (No Registration Required)

1. **NASA C-MAPSS Turbofan** - Start here for RUL prediction
2. **Azure Predictive Maintenance** - Multi-component failure prediction
3. **CWRU Bearing** - Vibration analysis

### For Healthcare Domain (Requires Registration)

1. **MIMIC-IV** - Healthcare equipment context
2. **PhysioNet waveforms** - Medical sensor patterns

### For Latest Research

1. **PHM Society challenges** - Annual new datasets
2. **PHMD library** - Unified access to 59 datasets

---

## 9. References

### Key Papers

1. Saxena, A., et al. (2008). "Damage Propagation Modeling for Aircraft Engine Run-to-Failure Simulation"
2. Johnson, A.E.W., et al. (2016). "MIMIC-III, a freely accessible critical care database"
3. Lei, Y., et al. (2018). "Machinery health prognostics: A systematic review from data acquisition to RUL prediction"

### Documentation Links

- NASA Prognostics: https://www.nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository/
- MIMIC: https://mimic.mit.edu/
- PhysioNet: https://physionet.org/
- PHM Society: https://www.phmsociety.org/

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-18 | Initial release |

