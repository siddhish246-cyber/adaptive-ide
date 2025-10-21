import { NextResponse } from "next/server";

export async function POST() {
  const outcomes = Array.from({ length: 20 }).map((_, i) => ({
    testId: `T${String(i + 1).padStart(2, "0")}`,
    passed: i < 12,             // 12/20 pass to demo UI
    time_ms: 3 + i,
    diff: i < 12 ? undefined : { expected: "[0,1]", got: "[]" },
  }));
  const passed = outcomes.filter(o => o.passed).length;
  return NextResponse.json({
    total: 20,
    passed,
    outcomes,
    approachHint: "Try checking complement before storing the current element.",
  });
}
