import { describe, expect, it } from "vitest";

import { INITIAL_SM2_STATE, reviewSM2 } from "@/lib/sm2";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("reviewSM2", () => {
  it("lần đầu nhớ tốt (quality=4): repetitions=1, interval=1 ngày", () => {
    const result = reviewSM2(INITIAL_SM2_STATE, 4, NOW);
    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.dueAt.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("lần 2 nhớ tốt: repetitions=2, interval=6 ngày", () => {
    const first = reviewSM2(INITIAL_SM2_STATE, 4, NOW);
    const second = reviewSM2(first, 4, NOW);
    expect(second.repetitions).toBe(2);
    expect(second.intervalDays).toBe(6);
  });

  it("lần 3 trở đi: interval = round(interval cũ * easeFactor)", () => {
    const first = reviewSM2(INITIAL_SM2_STATE, 4, NOW);
    const second = reviewSM2(first, 4, NOW);
    const third = reviewSM2(second, 4, NOW);
    expect(third.repetitions).toBe(3);
    expect(third.intervalDays).toBe(Math.round(second.intervalDays * second.easeFactor));
  });

  it("quality < 3 reset repetitions về 0 và interval về 1 ngày", () => {
    const first = reviewSM2(INITIAL_SM2_STATE, 4, NOW);
    const second = reviewSM2(first, 4, NOW);
    const forgot = reviewSM2(second, 1, NOW);
    expect(forgot.repetitions).toBe(0);
    expect(forgot.intervalDays).toBe(1);
  });

  it("easeFactor không bao giờ xuống dưới 1.3 dù quality=0 nhiều lần", () => {
    let state = INITIAL_SM2_STATE;
    for (let i = 0; i < 20; i++) {
      state = reviewSM2(state, 0, NOW);
    }
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("quality=5 (dễ) làm easeFactor tăng so với ban đầu", () => {
    const result = reviewSM2(INITIAL_SM2_STATE, 5, NOW);
    expect(result.easeFactor).toBeGreaterThan(INITIAL_SM2_STATE.easeFactor);
  });

  it("từ chối quality ngoài khoảng 0-5 hoặc không phải số nguyên", () => {
    expect(() => reviewSM2(INITIAL_SM2_STATE, 6, NOW)).toThrow(RangeError);
    expect(() => reviewSM2(INITIAL_SM2_STATE, -1, NOW)).toThrow(RangeError);
    expect(() => reviewSM2(INITIAL_SM2_STATE, 3.5, NOW)).toThrow(RangeError);
  });
});
