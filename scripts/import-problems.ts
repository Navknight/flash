// Builds backend/problems.json from DeepMind CodeContests (Codeforces problems, CC BY 4.0).
// Every problem is verified: a known-correct Python solution must pass all chosen tests
// inside a network-less Docker container, or the problem is dropped.
//
// Usage (Docker running): node scripts/import-problems.ts
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const PER_DIFFICULTY = 10;
const MAX_HIDDEN = 10;
const MAX_TEST_CHARS = 2000; // keeps problems.json small and Python fast enough
const TIMEOUT_S = 2; // same CPU limit the battles give Judge0
const BUCKETS = [
  { difficulty: "Easy", min: 800, max: 1200 },
  { difficulty: "Medium", min: 1300, max: 1600 },
  { difficulty: "Hard", min: 1700, max: 2000 },
];
// exact-output judging can't handle these
const UNJUDGEABLE =
  /any of them|print any|output any|any (one )?(of the )?(possible|valid|correct|such|suitable|optimal)|multiple (possible |valid |correct )?(answers|solutions)|several (possible )?answers|interactive|flush/i;
const PYTHON3 = 3;
const CODEFORCES = 2;

type Tests = { input: string[]; output: string[] };
type Row = {
  name: string;
  description: string;
  source: number;
  cf_rating: number;
  public_tests: Tests;
  private_tests: Tests;
  generated_tests: Tests;
  solutions: { language: number[]; solution: string[] };
  input_file: string;
  output_file: string;
};
type Test = { input: string; output: string };

const clean = (s: string) => s.replace(/[ \t]+$/gm, "").trimEnd();
const pairs = (t: Tests): Test[] => t.input.map((input, i) => ({ input, output: t.output[i] }));
const small = (t: Test) => t.input.length <= MAX_TEST_CHARS && t.output.length <= MAX_TEST_CHARS;

async function page(offset: number): Promise<Row[]> {
  const url = `https://datasets-server.huggingface.co/rows?dataset=deepmind/code_contests&config=default&split=train&offset=${offset}&length=100`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url);
    if (res.ok) return ((await res.json()) as { rows: { row: Row }[] }).rows.map((r) => r.row);
    console.warn(`page ${offset}: HTTP ${res.status}, retry ${attempt}`);
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
  throw new Error(`page ${offset} failed`);
}

// Drop the Examples section (shown separately in the UI) but keep the Note.
function statement(description: string) {
  const [body, rest = ""] = description.split(/\n\nExamples?\n/);
  const note = rest.match(/\n\nNote\n([\s\S]*)$/);
  return (note ? `${body.trim()}\n\nNote\n${note[1].trim()}` : body.trim());
}

// The job (solution + test inputs) goes in through stdin, not a mounted folder:
// Docker Desktop can't mount paths it doesn't share (e.g. /tmp).
const DRIVER = `
import json, subprocess, sys
job = json.load(sys.stdin)
open('/tmp/sol.py', 'w').write(job['solution'])
out = []
for t in job['tests']:
    try:
        p = subprocess.run([sys.executable, '/tmp/sol.py'], input=t, capture_output=True, text=True, timeout=job['timeout'])
        out.append(p.stdout if p.returncode == 0 else None)
    except subprocess.TimeoutExpired:
        out.append(None)
print(json.dumps(out))
`;

// Runs one solution against all tests in a sandbox.
// "pass": every output matches. "mismatch": ran fine but printed a different answer
// (an accepted solution disagreeing = the problem has several valid answers).
// "error": crashed or timed out (e.g. Python too slow), which says nothing about the tests.
function verify(solution: string, tests: Test[]): "pass" | "mismatch" | "error" {
  const run = spawnSync("docker", [
    "run", "--rm", "-i", "--network", "none", "--memory", "512m", "--cpus", "1",
    "python:3.8-slim", "python", "-c", DRIVER,
  ], {
    input: JSON.stringify({ solution, tests: tests.map((t) => t.input), timeout: TIMEOUT_S }),
    encoding: "utf8",
    timeout: 120_000,
  });
  // a broken sandbox must stop the import, not silently drop every problem
  if (run.status !== 0) throw new Error(`sandbox failed: ${run.stderr || run.error}`);
  const outputs: (string | null)[] = JSON.parse(run.stdout);
  if (outputs.some((o) => o === null)) return "error";
  return tests.every((t, i) => clean(outputs[i]!) === clean(t.output)) ? "pass" : "mismatch";
}

const picked = new Map<string, object[]>(BUCKETS.map((b) => [b.difficulty, []]));
const full = () => BUCKETS.every((b) => picked.get(b.difficulty)!.length >= PER_DIFFICULTY);

for (let offset = 0; offset < 3800 && !full(); offset += 100) {
  console.log(`fetching rows ${offset}-${offset + 99}...`);
  for (const row of await page(offset)) {
    const bucket = BUCKETS.find((b) => row.cf_rating >= b.min && row.cf_rating <= b.max);
    if (!bucket || picked.get(bucket.difficulty)!.length >= PER_DIFFICULTY) continue;
    if (row.source !== CODEFORCES || row.input_file || row.output_file || UNJUDGEABLE.test(row.description)) continue;
    if (row.description.includes("<image>")) continue; // the dataset has no images; statement would be incomplete

    const samples = pairs(row.public_tests).filter(small);
    const seen = new Set(samples.map((t) => t.input));
    const hidden = [...pairs(row.private_tests), ...pairs(row.generated_tests)]
      .filter((t) => small(t) && !seen.has(t.input) && seen.add(t.input))
      .slice(0, MAX_HIDDEN);
    if (samples.length === 0 || hidden.length < 3) continue;

    const tests = [...samples, ...hidden];
    const pySolutions = row.solutions.solution.filter((_, i) => row.solutions.language[i] === PYTHON3).slice(0, 3);
    if (pySolutions.length < 2) continue; // need two to detect multiple valid answers
    const results = pySolutions.map((s) => verify(s, tests));
    if (results.includes("mismatch") || results.filter((r) => r === "pass").length < 2) {
      console.log(`  drop ${row.name} (${results.join(", ")})`);
      continue;
    }

    const m = row.name.match(/^(\d+)_([A-Z]\d?)\. (.*)$/);
    if (!m) continue;
    const [, contest, index, title] = m;
    picked.get(bucket.difficulty)!.push({
      slug: `cf-${contest}${index.toLowerCase()}`,
      title,
      difficulty: bucket.difficulty,
      description: `${statement(row.description)}\n\nSource: Codeforces ${contest}${index}, via DeepMind CodeContests (CC BY 4.0)`,
      samples: samples.length,
      tests,
    });
    console.log(`  keep ${bucket.difficulty.padEnd(6)} ${row.cf_rating} ${row.name} (${tests.length} tests)`);
  }
}

const problems = BUCKETS.flatMap((b) => picked.get(b.difficulty)!);
writeFileSync(new URL("../backend/problems.json", import.meta.url), JSON.stringify(problems, null, 2) + "\n");
console.log(`wrote ${problems.length} problems:`, BUCKETS.map((b) => `${b.difficulty} ${picked.get(b.difficulty)!.length}`).join(", "));
