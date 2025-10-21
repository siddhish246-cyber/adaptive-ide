import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code: string = (body?.code ?? "").toLowerCase();

  // Tiny arithmetic example to show precedence error
  const a = 2, b = 6, c = 4;
  const expectedSteps = [
    { expr: "b + c", value: b + c },
    { expr: "a * (b + c)", value: a * (b + c) },
  ];
  const expectedVal = expectedSteps[1].value;

  const mulAddNoParens = code.includes("*") && code.includes("+") && !code.includes("(");
  const actualSteps = mulAddNoParens
    ? [{ expr: "a * b", value: a * b }, { expr: "a * b + c", value: a * b + c }]
    : expectedSteps;

  const actualVal = actualSteps[1].value;
  const divergedAt = actualVal === expectedVal ? null : 1;

  return NextResponse.json({
    exampleId: "E1",
    expected: { value: expectedVal, steps: expectedSteps },
    actual: { value: actualVal, steps: actualSteps },
    divergedAt,
    hint: divergedAt === null ? undefined : "Parentheses change precedence; compute (b+c) first.",
  });
}
