import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  // For MVP we just echo stdin so UI flows work
  const stdin = body?.stdin as string | undefined;
  const mockStdout = stdin ? String(stdin) : "ok";
  return NextResponse.json({ ok: true, stdout: mockStdout, stderr: "", time_ms: 5 });
}
