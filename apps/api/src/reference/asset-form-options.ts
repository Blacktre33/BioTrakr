import {
  AssetStatus,
  CriticalityLevel,
  DeviceCategory,
  RiskClassification,
} from '@prisma/client';

export interface FormOption {
  value: string;
  label: string;
  /** One short line shown under the choice, for values staff may confuse. */
  hint?: string;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Builds dropdown options straight from a Prisma enum, so the form can only
 * ever offer values the database accepts. Overrides change wording only.
 */
function optionsFor<T extends string>(
  values: Record<string, T>,
  overrides: Partial<Record<T, Partial<Omit<FormOption, 'value'>>>> = {},
): FormOption[] {
  return Object.values(values).map((value) => ({
    value,
    label: titleCase(value),
    ...overrides[value],
  }));
}

export const ASSET_FORM_ENUMS = {
  assetStatus: optionsFor(AssetStatus, {
    IN_MAINTENANCE: { hint: 'With biomedical engineering' },
    QUARANTINED: { hint: 'Do not use on patients' },
    CONDEMNED: { hint: 'Beyond repair; awaiting disposal' },
    DISPOSED: { hint: 'No longer on site' },
  }),
  deviceCategory: optionsFor(DeviceCategory, {
    IT_MEDICAL: { label: 'Medical IT' },
  }),
  criticalityLevel: optionsFor(CriticalityLevel),
  riskClassification: optionsFor(RiskClassification, {
    CLASS_I: { label: 'Class I', hint: 'Low risk' },
    CLASS_II: { label: 'Class II', hint: 'Moderate risk' },
    CLASS_III: { label: 'Class III', hint: 'High risk' },
  }),
};
