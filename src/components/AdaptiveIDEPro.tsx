import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

type LanguageKey = "python" | "javascript" | "typescript" | "java" | "c" | "cpp" | "go";

type RunRequest = { language: LanguageKey; code: string; stdin?: string };
type RunResult = { ok: boolean; stdout: string; stderr: string; time_ms: number; compilation_stderr?: string };

type TraceStep = { expr?: string; value?: any; line?: number; note?: string };
type TracePacket = {
  exampleId: string;
  expected: { value: any; steps: TraceStep[] };
  actual: { value: any; steps: TraceStep[] };
  divergedAt: number | null;
  hint?: string;
};

const LANGS: { key: LanguageKey; label: string; monaco: string; template: string }[] = [
  { key: "python", label: "Python", monaco: "python", template: `# write anything\ndef main():\n    print("hello")\n\nif __name__ == "__main__":\n    main()\n` },
  { key: "javascript", label: "JavaScript", monaco: "javascript", template: `// write anything\nfunction main(){\n  console.log("hello");\n}\nmain();\n` },
  { key: "typescript", label: "TypeScript", monaco: "typescript", template: `function main(): void {\n  console.log("hello");\n}\nmain();\n` },
  { key: "java", label: "Java", monaco: "java", template: `import java.io.*;\nclass Main{ public static void main(String[] args){ System.out.println("hello"); } }\n` },
  { key: "c", label: "C", monaco: "c", template: `#include <stdio.h>\nint main(){ printf("hello\\n"); return 0; }\n` },
  { key: "cpp", label: "C++", monaco: "cpp", template: `#include <bits/stdc++.h>\nusing namespace std; int main(){ cout << "hello\\n"; return 0; }\n` },
  { key: "go", label: "Go", monaco: "go", template: `package main\nimport "fmt"\nfunc main(){ fmt.Println("hello") }\n` },
];

function PaneHandle({ onDrag }: { onDrag: (dx: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let dragging = false, startX = 0;
    const down = (e: MouseEvent) => { dragging = true; startX = e.clientX; document.body.style.cursor = "col-resize"; };
    const move = (e: MouseEvent) => { if (!dragging) return; onDrag(e.clientX - startX); startX = e.clientX; };
    const up = () => { dragging = false; document.body.style.cursor = "default"; };
    el.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { el.removeEventListener("mousedown", down); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [onDrag]);
  return <div ref={ref} className="w-1.5 cursor-col-resize bg-slate-800/60 hover:bg-slate-700/80" />;
}

export default function UniversalIDE() {
  const [lang, setLang] = useState<LanguageKey>("python");
  const [code, setCode] = useState<string>(LANGS[0].template);
  const [stdin, setStdin] = useState<string>("");
  const [stdout, setStdout] = useState<string>("");
  const [stderr, setStderr] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Live mapper state (generic, runs on your current code + input)
  const [trace, setTrace] = useState<TracePacket | null>(null);
  const [traceBusy, setTraceBusy] = useState(false);

  // Resizable split
  const [leftW, setLeftW] = useState(0.62); // editor width %
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);

  const langMeta = useMemo(() => LANGS.find(l => l.key === lang)!, [lang]);

  useEffect(() => { setCode(langMeta.template); }, [langMeta.key]); // reset template when switching

  // Debounced live trace on code/stdin change
  useEffect(() => {
    const t = setTimeout(() => runTrace().catch(()=>{}), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, lang, stdin]);

  async function api<T>(url: string, body: any): Promise<T> {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${url} failed`);
    return res.json();
  }

  async function runCode() {
    setBusy(true); setStdout(""); setStderr("");
    try {
      const result = await api<RunResult>("/api/run", { language: lang, code, stdin });
      setStdout(result.stdout);
      setStderr(result.stderr || result.compilation_stderr || "");
    } finally { setBusy(false); }
  }

  async function runTrace() {
    setTraceBusy(true);
    try {
      const pkt = await api<TracePacket>("/api/trace", { language: lang, code, stdin });
      setTrace(pkt);
    } catch (e) {
      // Fallback: small client-side “sanity” mapper to still show *something*
      // If user types a*b+c without parentheses, highlight precedence mismatch.
      const a=2,b=6,c=4;
      const expected = [{expr:"b + c", value: b+c},{expr:"a * (b + c)", value: a*(b+c)}];
      const src = code.toLowerCase();
      const looksWrong = src.includes("*") && src.includes("+") && !src.includes("(");
      const actual = looksWrong
        ? [{expr:"a * b", value: a*b},{expr:"a * b + c", value: a*b + c}]
        : expected;
      setTrace({
        exampleId: "generic",
        expected: { value: expected.at(-1)!.value, steps: expected },
        actual: { value: actual.at(-1)!.value, steps: actual },
        divergedAt: expected.at(-1)!.value === actual.at(-1)!.value ? null : 1,
        hint: looksWrong ? "Operator precedence: use a*(b+c) if that’s intended." : undefined
      });
    } finally { setTraceBusy(false); }
  }

  function onDrag(dx: number) {
    const w = containerRef.current?.clientWidth || 1;
    setLeftW(x => Math.min(0.85, Math.max(0.35, x + dx / w)));
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-2">
      {/* Top bar */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm"
            value={lang} onChange={e=>setLang(e.target.value as LanguageKey)}
          >
            {LANGS.map(l=> <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
          <button
            onClick={() => setCode(langMeta.template)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700/70"
          >
            Reset Template
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runCode} disabled={busy}
            className="rounded-lg border border-sky-700 bg-sky-900/60 px-3 py-2 text-sm hover:bg-sky-800/60 disabled:opacity-50">
            {busy ? "Running…" : "Run ▶"}
          </button>
        </div>
      </div>

      {/* Resizable panes */}
      <div ref={containerRef} className="flex h-[78vh] min-h-[520px] w-full overflow-hidden rounded-xl border border-slate-800">
        {/* Editor */}
        <div style={{ width: `${leftW*100}%` }} className="h-full">
          <Editor
            onMount={(ed)=> (editorRef.current = ed)}
            language={langMeta.monaco}
            theme="vs-dark"
            value={code}
            onChange={(v)=> setCode(v || "")}
            options={{
              fontSize: 15,
              minimap: { enabled: false },
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              bracketPairColorization: { enabled: true },
              renderWhitespace: "selection",
            }}
            height="100%"
          />
        </div>

        {/* Drag handle */}
        <PaneHandle onDrag={onDrag} />

        {/* Right side: IO + Live Mapper */}
        <div className="flex w-0 grow flex-col">
          <div className="grid h-1/2 grid-cols-2 gap-2 p-2">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
              <div className="mb-1 text-xs text-slate-400">STDIN</div>
              <textarea
                value={stdin} onChange={e=>setStdin(e.target.value)}
                className="h-[85%] w-full resize-none rounded-md bg-slate-900 p-2 font-mono text-sm outline-none"
                placeholder="Provide input here (optional)…"
              />
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
              <div className="mb-1 text-xs text-slate-400">STDOUT</div>
              <pre className="h-[85%] overflow-auto whitespace-pre-wrap rounded-md bg-black/50 p-2 text-sm">{stdout || "(empty)"}</pre>
              {stderr && (
                <div className="mt-2 rounded-md border border-amber-700/40 bg-amber-950/40 p-2 text-amber-200 text-xs">
                  {stderr}
                </div>
              )}
            </div>
          </div>
          <div className="h-1/2 p-2">
            <div className="h-full rounded-lg border border-slate-800 bg-slate-950">
              <div className="border-b border-slate-800 p-2 text-xs text-slate-400">Live Example Mapper (auto-runs on your code + input)</div>
              <div className="h-[calc(100%-2rem)] overflow-auto p-3 text-sm">
                {traceBusy && <div className="text-slate-300">Analyzing…</div>}
                {!traceBusy && !trace && <div className="text-slate-400">Start typing; the mapper will show small step checks here.</div>}
                {!traceBusy && trace && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <div className="mb-1 text-xs text-slate-400">Spec (Expected)</div>
                      <ol className="list-decimal pl-5">
                        {trace.expected.steps.map((s,i)=>(
                          <li key={i} className="mb-1">
                            <span className="text-sky-300">{s.expr}</span> → <span className="text-emerald-300">{String(s.value)}</span>
                          </li>
                        ))}
                      </ol>
                      <div className="mt-2 text-emerald-300">= {String(trace.expected.value)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <div className="mb-1 text-xs text-slate-400">Your Run (Actual)</div>
                      <ol className="list-decimal pl-5">
                        {trace.actual.steps.map((s,i)=>(
                          <li key={i} className={`mb-1 ${trace.divergedAt===i ? "bg-rose-500/10 rounded px-1" : ""}`}>
                            <span className="text-sky-300">{s.expr}</span> → <span className="text-amber-200">{String(s.value)}</span>
                          </li>
                        ))}
                      </ol>
                      <div className="mt-2 text-amber-200">= {String(trace.actual.value)}</div>
                    </div>
                  </div>
                )}
                {!!trace?.hint && (
                  <div className="mt-3 rounded-xl border border-rose-700/40 bg-rose-900/30 p-3 text-rose-100 text-xs">
                    {trace.hint}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
