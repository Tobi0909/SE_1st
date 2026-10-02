/**
 * SM-2 (SuperMemo 2) đơn giản. `quality` theo thang 0-5:
 * 0-2 = quên/sai (reset), 3-5 = nhớ đúng (càng cao càng dễ).
 */
export interface SM2State {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

export interface SM2Result extends SM2State {
  dueAt: Date;
}

const MIN_EASE_FACTOR = 1.3;

export function reviewSM2(state: SM2State, quality: number, now: Date = new Date()): SM2Result {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new RangeError("quality phải là số nguyên từ 0 đến 5");
  }

  let { easeFactor, intervalDays, repetitions } = state;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
    repetitions += 1;
  }

  easeFactor = Math.max(
    MIN_EASE_FACTOR,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  const dueAt = new Date(now);
  dueAt.setDate(dueAt.getDate() + intervalDays);

  return { easeFactor, intervalDays, repetitions, dueAt };
}

export const INITIAL_SM2_STATE: SM2State = {
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
};
