import type { TrainingAssessment } from '@prisma/client';

/** "10 passed, 1 needs retraining, 2 not assessed". */
export function assessmentText(
  attendees: Array<{ assessment: TrainingAssessment }>,
): string {
  const count = (a: TrainingAssessment) =>
    attendees.filter((x) => x.assessment === a).length;
  return [
    [count('PASSED'), 'passed'],
    [count('NEEDS_RETRAINING'), 'need retraining'],
    [count('NOT_ASSESSED'), 'not assessed'],
  ]
    .filter(([n]) => n)
    .map(([n, what]) =>
      n === 1 && what === 'need retraining'
        ? '1 needs retraining'
        : `${n} ${what}`,
    )
    .join(', ');
}
