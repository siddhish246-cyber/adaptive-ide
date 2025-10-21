import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

export type LanguageKey = "python" | "javascript" | "typescript" | "java" | "c" | "cpp" | "go";
export type TestCase = { id: string; difficulty: "low" | "med" | "high"; input: string; expected: string; timeout_ms?: number; };
export type Problem = {
  id: string; title: string; statement: string;
  functionSignature: Record<LanguageKey, string>;
  constraints: string[]; examples: { input: string; output: string; explain?: string }[];
  tests: TestCase[]; timeLimits: Partial<Record<LanguageKey, number>>; memoryMB?: number;
};
export type RunRequest = { language: LanguageKey; code: string; stdin?: string; problemId?: string; test?: TestCase };
export type RunResult = { ok: boolean; stdout: string; stderr: string; time_ms: number; mem_kb?: number; compilation_stderr?: string };
export type GradeRequest = { language: LanguageKey; code: string; problemId: string };
export type TestOutcome = { testId: string; passed: boolean; time_ms: number; stderr?: string; diff?: { expected: string; got: string } };
export type GradeResult = { total: number; passed: number; outcomes: TestOutcome[]; approachHint?: string };
export type TraceStep = { expr?: string; value?: any; line?: number; note?: string };
export type TracePacket = {
  exampleId: string;
  expected: { value: any; steps: TraceStep[] };
  actual: { value: any; steps: TraceStep[] };
  divergedAt: number | null;
  hint?: string;
};

const starterProblem: Problem = {
  id: "two-sum",
  title: "Two Sum",
  statement: "Given an array of integers and a target, return indices of two numbers adding to target (unique solution).",
  functionSignature: {
    python: `def two_sum(nums, target):
    # TODO: implement
    return [0,1]
`,
    javascript: `function twoSum(nums, target) {
  // TODO
  return [0,1];
}
module.exports = twoSum;
`,
    typescript: `export function twoSum(nums: number[], target: number): [number, number] {
  // TODO
  return [0,1];
}
`,
    java: `import java.util.*;
class Solution {
  public int[] twoSum(int[] nums, int target){
    // TODO
    return new int[]{0,1};
  }
}
`,
    c: `#include <stdio.h>
int main(){return 0;}
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;
int main(){return 0;}
`,
    go: `package main
import "fmt"
func twoSum(nums []int, target int) []int {
  // TODO
  return []int{0,1}
}
func main(){fmt.Println("ok")}
`,
  },
  constraints: ["2 ≤ n ≤ 2e5", "-1e9 ≤ nums[i], target ≤ 1e9", "Exactly one valid answer"],
  examples: [
    { input: "[2,7,11,15], 9", output: "[0,1]", explain: "2 + 7 = 9" },
    { input: "[3,2,4], 6", output: "[1,2]" },
  ],
  tests: Array.from({ length: 20 }).map((_, i) => ({
    id: `T${String(i + 1).padStart(2, "0")}`,
    difficulty: i < 7 ? "low" : i < 14 ? "med" : "high",
    input: JSON.stringify({ nums: [2, 7, 11, 15], target: 9 }),
    expected: JSON.stringify([0, 1]),
    timeout_ms: i < 14 ? 1500 : 2500,
  })),
  timeLimits: { python: 2000, javascript: 2000, typescript: 2000, java: 3000, c: 1500, cpp: 1500, go: 1500 },
  memoryMB: 256,
};

const LANGUAGE_OPTIONS: { key: LanguageKey; label: string; monaco: string }[] = [
  { key: "python", label: "Python", monaco: "python" },
  { key: "javascript", label: "JavaScript", monaco: "javascript" },
  { key: "typescript", label: "TypeScript", monaco: "typescript" },
  { key: "java", label: "Java", monaco: "java" },
  { key: "c", label: "C", monaco: "c" },
  { key: "cpp", label: "C++", monaco: "cpp" },
  { key: "go", label: "Go", monaco: "go" },
];

function badgeColor(kind: "low" | "med" | "high") {
  return kind === "low" ? "bg-emerald-500/20 text-emerald-300"
       : kind === "med" ? "bg-amber-500/20 text-amber-300"
       : "bg-fuchsia-500/20 text-fuchsia-300";
}

function MapperPanel({ trace, busy }: { trace: TracePacket | null; busy: boolean }) {
  if (busy) return <div className="p-3 text-sm text-slate-300">Running live example…</div>;
  if (!trace) return <div className="p-3 text-sm text-slate-400">Edit code to see a live mapping of a tiny example here.</div>;
  const { expected, actual, divergedAt, hint } = trace;
  return (
    <div className="h-full overflow-auto p-3 text-sm">
      <div className="mb-2 text-xs text-slate-400">Example Mapper • Example {trace.exampleId}</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="mb-1 text-xs text-slate-400">Spec (Expected)</div>
          <ol className="list-decimal pl-5">
            {expected.steps.map((s, i) => (
              <li key={i} className="mb-1">
                <span className="text-sky-300">{s.expr}</span>{" → "}
                <span className="text-emerald-300">{String(s.value)}</span>
              </li>
            ))}
          </ol>
          <div className="mt-2 text-emerald-300">= {String(expected.value)}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="mb-1 text-xs text-slate-400">Your Run (Actual)</div>
          <ol className="list-decimal pl-5">
            {actual.steps.map((s, i) => (
              <li key={i} className={`mb-1 ${divergedAt === i ? "bg-rose-500/10 rounded px-1" : ""}`}>
                <span className="text-sky-300">{s.expr}</span>{" → "}
                <span className="text-amber-200">{String(s.value)}</span>
              </li>
            ))}
          </ol>
          <div className="mt-2 text-amber-200">= {String(actual.value)}</div>
        </div>
      </div>
      {divergedAt !== null && (
        <div className="mt-3 rounded-xl border border-rose-700/40 bg-rose-900/30 p-3 text-rose-100">
          <div className="font-semibold">Diverged at step {divergedAt + 1}</div>
          {hint && <div className="text-xs opacity-90">{hint}</div>}
        </div>
      )}
    </div>
  );
}

export default function AdaptiveIDEPro() {
  const [problem, setProblem] = useState<Problem>(starterProblem);
  const [lang, setLang] = useState<LanguageKey>("python");
  const [code, setCode] = useState<string>(problem.functionSignature["python"]);
  const [stdout, setStdout] = useState<string>("");
  const [stderr, setStderr] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [activeTab, setActiveTab] = useState<"problem" | "examples" | "tests" | "output" | "notebook">("problem");
  const [trace, setTrace] = useState<TracePacket | null>(null);
  const [traceBusy, setTraceBusy] = useState(false);
  const editorRef = useRef<any>(null);

  useEffect(() => { setCode(problem.functionSignature[lang] ?? ""); }, [lang, problem]);

  useEffect(() => {
    const h = setTimeout(() => { runLiveTrace().catch(() => {}); }, 600);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, lang]);

  async function api<T>(url: string, body: any): Promise<T> {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${url} failed`);
    return res.json();
  }

  async function callRun(req: RunRequest): Promise<RunResult> { return api<RunResult>("/api/run", req); }
  async function callGrade(req: GradeRequest): Promise<GradeResult> { return api<GradeResult>("/api/grade", req); }

  async function runLiveTrace() {
    setTraceBusy(true);
    try {
      const pkt = await api<TracePacket>("/api/trace", { language: lang, code, problemId: problem.id });
      setTrace(pkt);
    } catch {
      // Fallback hint if API fails
      const a = 2, b = 6, c = 4;
      const expectedSteps: TraceStep[] = [{ expr: "b + c", value: b + c }, { expr: "a * (b + c)", value: a * (b + c) }];
      const src = code.toLowerCase();
      const looksLikeMulAdd = src.includes("*") && src.includes("+") && !src.includes("(");
      const actualSteps: TraceStep[] = looksLikeMulAdd ? [{ expr: "a * b", value: a * b }, { expr: "a * b + c", value: a * b + c }] : expectedSteps;
      const expectedVal = expectedSteps[1].value as number;
      const actualVal = actualSteps[1].value as number;
      const divergedAt = expectedVal === actualVal ? null : 1;
      setTrace({ exampleId: "E1", expected: { value: expectedVal, steps: expectedSteps }, actual: { value: actualVal, steps: actualSteps }, divergedAt, hint: divergedAt !== null ? "Parentheses change precedence; compute (b+c) first." : undefined });
    } finally { setTraceBusy(false); }
  }

  async function handleRunCustom() {
    try {
      setBusy(true); setStdout(""); setStderr(""); setActiveTab("output");
      const result = await callRun({ language: lang, code });
      setStdout(result.stdout); setStderr(result.stderr || result.compilation_stderr || "");
    } finally { setBusy(false); }
  }

  async function handleRunTests() {
    try {
      setGrading(true); setGrade(null); setActiveTab("tests");
      const result = await callGrade({ language: lang, code, problemId: problem.id });
      setGrade(result);
    } finally { setGrading(false); }
  }

  const passPct = useMemo(() => (grade ? Math.round((grade.passed / grade.total) * 100) : 0), [grade]);

  return (
    <div className="mx-auto max-w-[1400px] p-4 text-slate-100">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight">Adaptive IDE — <span className="text-sky-300">{problem.title}</span></h1>
        <div className="flex items-center gap-2">
          <select className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm" value={lang} onChange={(e) => setLang(e.target.value as LanguageKey)}>
            {LANGUAGE_OPTIONS.map((o) => (<option key={o.key} value={o.key}>{o.label}</option>))}
          </select>
          <button onClick={handleRunCustom} disabled={busy} className="rounded-xl border border-sky-700 bg-sky-900/60 px-3 py-2 text-sm hover:bg-sky-800/60 disabled:opacity-50">{busy ? "Running…" : "Run ▶"}</button>
          <button onClick={handleRunTests} disabled={grading} className="rounded-xl border border-emerald-700 bg-emerald-900/60 px-3 py-2 text-sm hover:bg-emerald-800/60 disabled:opacity-50">{grading ? "Grading…" : "Run Tests (20)"}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        {/* LEFT: problem panel */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70">
          <div className="flex gap-2 border-b border-slate-800 p-2 text-xs">
            {(["problem", "examples", "tests", "output", "notebook"] as const).map((t) => (
              <button key={t} onClick={() => setActiveTab(t)} className={`rounded-lg px-3 py-2 ${activeTab === t ? "bg-slate-800 text-sky-300" : "hover:bg-slate-800/60"}`}>{t.toUpperCase()}</button>
            ))}
          </div>
          <div className="p-3">
            {activeTab === "problem" && (
              <div>
                <h2 className="mb-2 text-lg font-bold">{problem.title}</h2>
                <p className="text-sm text-slate-300">{problem.statement}</p>
                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <h3 className="mb-1 text-xs font-semibold text-slate-400">Constraints</h3>
                  <ul className="list-disc pl-5 text-sm text-slate-300">{problem.constraints.map((c, i) => (<li key={i}>{c}</li>))}</ul>
                </div>
                <div className="mt-3 space-y-2">
                  {problem.examples.map((ex, i) => (
                    <div key={i} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <div className="text-xs text-slate-400">Example {i + 1}</div>
                      <div className="text-sm"><span className="text-slate-400">Input:</span> {ex.input}</div>
                      <div className="text-sm"><span className="text-slate-400">Output:</span> {ex.output}</div>
                      {ex.explain && <div className="text-xs text-slate-400">{ex.explain}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === "tests" && (
              <div>
                <div className="mb-2 text-sm text-slate-300">20 test cases (low → high). Click "Run Tests" to grade.</div>
                {grade && (
                  <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div className="mb-1 text-sm font-semibold">Score: {grade.passed}/{grade.total} <span className="text-slate-400">({passPct}%)</span></div>
                    {grade.approachHint && <div className="text-xs text-amber-300">{grade.approachHint}</div>}
                  </div>
                )}
                <div className="grid max-h-[340px] grid-cols-1 gap-2 overflow-auto">
                  {problem.tests.map((t) => {
                    const outcome = grade?.outcomes.find((o) => o.testId === t.id);
                    const status = outcome ? (outcome.passed ? "bg-emerald-500/15 border-emerald-700/40" : "bg-rose-500/15 border-rose-700/40") : "bg-slate-950 border-slate-800";
                    return (
                      <div key={t.id} className={`rounded-xl border p-3 ${status}`}>
                        <div className="mb-1 flex items-center justify-between">
                          <div className={`rounded-full px-2 py-0.5 text-[10px] ${badgeColor(t.difficulty)} font-semibold`}>{t.difficulty.toUpperCase()}</div>
                          <div className="text-xs text-slate-400">ID: {t.id}</div>
                        </div>
                        <div className="text-xs text-slate-300"><span className="text-slate-400">Input</span>: {t.input}</div>
                        {outcome && (
                          <div className="mt-1 text-xs">
                            <div className="text-slate-300"><span className="text-slate-400">Time</span>: {outcome.time_ms} ms</div>
                            {outcome.diff && (<div className="mt-1 rounded-lg bg-slate-900 p-2 text-[11px] text-rose-300">Expected: {outcome.diff.expected}{"\n"}Got: {outcome.diff.got}</div>)}
                            {outcome.stderr && <div className="mt-1 text-[11px] text-amber-300">{outcome.stderr}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {activeTab === "output" && (
              <div className="space-y-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="text-xs text-slate-400">STDOUT</div>
                  <pre className="whitespace-pre-wrap text-sm">{stdout || "(empty)"}</pre>
                </div>
                {stderr && (
                  <div className="rounded-xl border border-amber-800/40 bg-amber-950/40 p-3">
                    <div className="text-xs text-amber-300">STDERR / Compiler</div>
                    <pre className="whitespace-pre-wrap text-sm text-amber-200">{stderr}</pre>
                  </div>
                )}
              </div>
            )}
            {activeTab === "notebook" && (
              <div className="h-[560px] overflow-hidden rounded-xl border border-slate-800">
                <iframe title="Jupyter Notebook" src="/jupyterlite/index.html" className="h-full w-full" />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: editor + live mapper */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70">
          <div className="grid grid-rows-[auto_1fr]">
            <div className="flex items-center justify-between border-b border-slate-800 p-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-slate-800 px-2 py-1 text-slate-300">{LANGUAGE_OPTIONS.find((l) => l.key === lang)?.label}</span>
                <span className="text-slate-400">Theme:</span>
                <select className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1" onChange={(e) => { const theme = e.target.value; (window as any).__monacoTheme = theme; }}>
                  <option value="vs-dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setCode(problem.functionSignature[lang] || "")} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700/70">
                  Reset Template
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 p-2 lg:grid-cols-2">
              <div className="h-[540px] overflow-hidden rounded-xl border border-slate-800">
                <Editor
                  onMount={(ed) => (editorRef.current = ed)}
                  language={LANGUAGE_OPTIONS.find((l) => l.key === lang)?.monaco}
                  theme={(window as any).__monacoTheme || "vs-dark"}
                  value={code}
                  onChange={(v) => setCode(v || "")}
                  options={{
                    fontSize: 14, minimap: { enabled: false }, roundedSelection: true,
                    scrollBeyondLastLine: false, tabSize: 2, wordWrap: "on",
                    cursorBlinking: "smooth", automaticLayout: true, bracketPairColorization: { enabled: true },
                  }}
                />
              </div>
              <div className="h-[540px] overflow-hidden rounded-xl border border-slate-800">
                <div className="border-b border-slate-800 p-2 text-xs text-slate-400">Live Example Mapper</div>
                <MapperPanel trace={trace} busy={traceBusy} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* footer tips */}
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
          <div className="font-semibold text-slate-200">Tips</div>
          Live mapping runs a tiny example while you type. Use <span className="rounded bg-slate-800 px-1">Run ▶</span> for custom input and <span className="rounded bg-slate-800 px-1">Run Tests</span> for the full 20-case suite.
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
          <div className="font-semibold text-slate-200">Shortcuts</div>
          Ctrl/⌘+Enter: Run • Ctrl/⌘+Shift+T: Run Tests • Esc: Stop
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
          <div className="font-semibold text-slate-200">Notebook</div>
          A Python notebook is available under the Notebook tab (JupyterLite). Replace the placeholder later.
        </div>
      </div>
    </div>
  );
}
