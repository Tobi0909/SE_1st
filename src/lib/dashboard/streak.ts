function toUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, delta: number): Date {
  const d = toUtcMidnight(date);
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

export function toDateKey(date: Date): string {
  return toUtcMidnight(date).toISOString().slice(0, 10);
}

/**
 * Số ngày liên tiếp có hoạt động, tính đến hôm nay HOẶC hôm qua (nếu hôm nay chưa có hoạt
 * động thì streak coi như còn "sống" tới hết hôm nay, giống cách Duolingo tính). Không có
 * hoạt động ở cả 2 ngày đó -> streak coi như đã đứt, trả về 0.
 */
export function computeStreak(activityDates: string[], today: Date = new Date()): number {
  const daySet = new Set(activityDates);
  const todayKey = toDateKey(today);
  const yesterdayKey = toDateKey(addDays(today, -1));

  let cursor: Date;
  if (daySet.has(todayKey)) {
    cursor = toUtcMidnight(today);
  } else if (daySet.has(yesterdayKey)) {
    cursor = addDays(today, -1);
  } else {
    return 0;
  }

  let streak = 0;
  while (daySet.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
