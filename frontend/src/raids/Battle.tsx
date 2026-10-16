import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AnswerResult,
  FeedItem,
  NextResult,
  Question,
  RaidState,
} from "./types";

type Props = {
  state: RaidState;
  feed: FeedItem[];
  myUid: string;
  next: () => Promise<NextResult>;
  answer: (questionId: number, choiceIndex: number) => Promise<AnswerResult>;
};

const clock = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

export default function Battle({ state, feed, myUid, next, answer }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [question, setQuestion] = useState<Question | null>(null);
  const [secondsAllowed, setSecondsAllowed] = useState(20);
  const [shownAt, setShownAt] = useState(0);
  const [done, setDone] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    setError("");
    setPicked(null);
    setResult(null);
    setBusy(true);
    try {
      const r = await next();
      if (r.done || !r.question) {
        setDone(true);
        setQuestion(null);
      } else {
        setDone(false);
        setQuestion(r.question);
        setSecondsAllowed(r.secondsAllowed ?? 20);
        setShownAt(Date.now());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // fetch the first question when the battle opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void load(), []);

  const pick = async (i: number) => {
    if (!question || busy || result) return;
    setBusy(true);
    setPicked(i);
    setError("");
    try {
      setResult(await answer(question.id, i));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPicked(null);
    } finally {
      setBusy(false);
    }
  };

  const secsLeft = state.endsAt
    ? Math.max(0, Math.ceil((state.endsAt - now) / 1000))
    : 0;
  const hpPct = state.bossMaxHp
    ? Math.max(0, (100 * state.hpRemaining) / state.bossMaxHp)
    : 0;
  const speedLeft =
    question && !result
      ? Math.max(0, 1 - (now - shownAt) / (secondsAllowed * 1000))
      : 0;
  const me = state.players.find((p) => p.uid === myUid);
  const ranking = [...state.players].sort(
    (a, b) => b.totalDamage - a.totalDamage,
  );

  return (
    <div className="mx-auto mt-6 flex max-w-5xl flex-col gap-4 px-4 pb-10">
      <Card>
        <CardContent className="flex flex-col gap-3 py-5">
          <div className="flex items-baseline justify-between">
            <h1 className="text-2xl font-bold">{state.bossName}</h1>
            <span className="font-mono text-lg">{clock(secsLeft)}</span>
          </div>
          <div className="h-5 overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-red-500 transition-all duration-500"
              style={{ width: `${hpPct}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {state.hpRemaining.toLocaleString()} /{" "}
            {state.bossMaxHp.toLocaleString()} HP · {state.title}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Your attack</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {me?.answered ?? 0} / {state.questionCount} answered
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {error && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-red-500">{error}</p>
                  <Button variant="outline" onClick={load}>
                    Try again
                  </Button>
                </div>
              )}

              {!question && !done && !error && (
                <p className="animate-pulse text-muted-foreground">
                  Loading your question...
                </p>
              )}

              {done && (
                <p className="py-6 text-center text-muted-foreground">
                  You've answered every question. Stay and cheer on the party
                  while they finish the boss!
                </p>
              )}

              {question && (
                <>
                  <p className="text-lg font-medium">{question.prompt}</p>

                  {!result && (
                    <div>
                      <div className="h-1.5 overflow-hidden rounded bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${speedLeft * 100}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Answer fast for bonus damage
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {question.choices.map((c, i) => {
                      const tone = result
                        ? i === result.correctIndex
                          ? "border-green-500 text-green-500"
                          : i === picked
                            ? "border-red-500 text-red-500"
                            : ""
                        : "";
                      return (
                        <Button
                          key={i}
                          variant="outline"
                          className={`h-auto justify-start whitespace-normal py-3 text-left ${tone}`}
                          onClick={() => pick(i)}
                        >
                          <span className="mr-2 font-mono text-muted-foreground">
                            {String.fromCharCode(65 + i)}
                          </span>
                          {c}
                        </Button>
                      );
                    })}
                  </div>

                  {result && (
                    <div className="flex items-center justify-between">
                      <p
                        className={
                          result.correct ? "text-green-500" : "text-red-500"
                        }
                      >
                        {result.correct
                          ? `Direct hit! ${result.damage} damage`
                          : "Missed, no damage"}
                      </p>
                      <Button onClick={load}>Next question</Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Live feed</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {feed.length === 0 && (
                <p className="text-muted-foreground">No attacks yet.</p>
              )}
              {feed.slice(0, 8).map((f) => (
                <p key={f.id}>
                  <span className="font-medium">
                    {f.uid === myUid ? "You" : f.name}
                  </span>{" "}
                  {f.correct ? (
                    <span className="text-green-500">hit for {f.damage}</span>
                  ) : (
                    <span className="text-muted-foreground">missed</span>
                  )}
                </p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Party damage</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {ranking.map((p, i) => (
                <div key={p.uid} className="flex justify-between">
                  <span>
                    {i + 1}. {p.uid === myUid ? "You" : p.name}
                  </span>
                  <span className="font-mono">{p.totalDamage}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}