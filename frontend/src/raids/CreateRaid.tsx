import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CreateInput, NewQuestion } from "./types";

const blank = (): NewQuestion => ({
  prompt: "",
  choices: ["", "", "", ""],
  correctIndex: 0,
});

// Quick-add format: blocks separated by a blank line.
// First line = question, then the choices, and put * before the correct one.
function parseBlocks(text: string): NewQuestion[] {
  return text
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length >= 3 && lines.length <= 7)
    .map(([prompt, ...rest]) => ({
      prompt,
      choices: rest.map((l) => l.replace(/^\*\s*/, "")),
      correctIndex: rest.findIndex((l) => l.startsWith("*")),
    }))
    .filter((q) => q.correctIndex >= 0);
}

type Props = {
  onCreate: (input: CreateInput) => Promise<void>;
  onCancel: () => void;
};

export default function CreateRaid({ onCreate, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [bossName, setBossName] = useState("The Procrastination Dragon");
  const [bossHp, setBossHp] = useState("2000");
  const [minutes, setMinutes] = useState("30");
  const [questions, setQuestions] = useState<NewQuestion[]>([blank()]);
  const [bulk, setBulk] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const patch = (i: number, change: Partial<NewQuestion>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...change } : q)));

  const setChoice = (i: number, ci: number, value: string) =>
    patch(i, {
      choices: questions[i].choices.map((c, k) => (k === ci ? value : c)),
    });

  const addFromText = () => {
    const parsed = parseBlocks(bulk);
    if (parsed.length === 0) {
      setError(
        "Couldn't read any questions. Each block needs a question line, 2-6 choices, and a * before the correct one.",
      );
      return;
    }
    setError("");
    setQuestions((qs) => [...qs.filter((q) => q.prompt.trim()), ...parsed]);
    setBulk("");
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await onCreate({
        title,
        bossName,
        bossHp: Number(bossHp),
        durationMin: Number(minutes),
        questions,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-4 px-4 pb-12">
      <h1 className="text-center text-3xl font-bold">Create a raid</h1>

      <Card>
        <CardHeader>
          <CardTitle>The boss</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            placeholder="Raid title (e.g. Thermodynamics revision)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            placeholder="Boss name"
            value={bossName}
            onChange={(e) => setBossName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              Boss HP
              <Input
                type="number"
                value={bossHp}
                onChange={(e) => setBossHp(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              Time limit (minutes)
              <Input
                type="number"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Each correct answer deals about 100-150 damage, depending on how
            fast it is. Pick an HP your group can realistically beat.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick add from text</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={7}
            placeholder={
              "What is the SI unit of force?\nJoule\n*Newton\nWatt\nPascal\n\nWhich law says F = ma?\n*Newton's second law\nOhm's law"
            }
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            One block per question, separated by a blank line: the question,
            then 2-6 choices, with * in front of the correct one.
          </p>
          <Button
            variant="outline"
            onClick={addFromText}
            disabled={!bulk.trim()}
          >
            Add these questions
          </Button>
        </CardContent>
      </Card>

      {questions.map((q, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Question {i + 1}</CardTitle>
            {questions.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setQuestions((qs) => qs.filter((_, j) => j !== i))
                }
              >
                Remove
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Input
              placeholder="Question"
              value={q.prompt}
              onChange={(e) => patch(i, { prompt: e.target.value })}
            />
            {q.choices.map((c, ci) => (
              <div key={ci} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${i}`}
                  checked={q.correctIndex === ci}
                  onChange={() => patch(i, { correctIndex: ci })}
                  title="Mark as the correct answer"
                />
                <Input
                  placeholder={`Choice ${ci + 1}`}
                  value={c}
                  onChange={(e) => setChoice(i, ci, e.target.value)}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              The selected circle marks the correct answer.
            </p>
          </CardContent>
        </Card>
      ))}

      <Button
        variant="outline"
        disabled={questions.length >= 50}
        onClick={() => setQuestions((qs) => [...qs, blank()])}
      >
        + Add a question
      </Button>

      {error && <p className="text-center text-sm text-red-500">{error}</p>}

      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy} onClick={submit}>
          {busy ? "Creating..." : "Create raid"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}