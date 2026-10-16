import { useState } from "react";
import { useSearchParams } from "react-router";
import { useUser } from "./firebase";
import { useRaid } from "./raids/useRaid";
import CreateRaid from "./raids/CreateRaid";
import Battle from "./raids/Battle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function BossRaid() {
  const user = useUser();
  const raid = useRaid(user?.uid);
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const inviteCode = params.get("join");
  const { state, end } = raid;

  // runs an action and shows its error message instead of crashing
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const joinWith = (c: string) =>
    run(async () => {
      await raid.join(c.trim().toUpperCase());
      setParams({});
      setCode("");
    });

  // ---------- not signed in ----------
  if (!user) {
    return (
      <p className="mt-16 text-center text-muted-foreground">
        Sign in to join a boss raid.
      </p>
    );
  }

  // ---------- results ----------
  if (state && end) {
    const won = end.result === "won";
    return (
      <div className="mx-auto mt-10 flex max-w-xl flex-col gap-4 px-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold">
            {won ? "Victory!" : "The boss survived"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {won
              ? `${state.bossName} was defeated by the party.`
              : `${state.bossName} had ${state.hpRemaining.toLocaleString()} HP left when time ran out.`}
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Damage ranking</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {end.leaderboard.map((p, i) => (
              <div
                key={p.uid}
                className="flex items-center justify-between border-b py-1 text-sm last:border-0"
              >
                <span>
                  {i + 1}. {p.uid === user.uid ? "You" : p.name}
                </span>
                <span className="text-muted-foreground">
                  {p.correct}/{p.answered} correct ·{" "}
                  <span className="font-mono text-foreground">
                    {p.totalDamage}
                  </span>{" "}
                  dmg
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Button onClick={raid.leave}>Back to raids</Button>
      </div>
    );
  }

  // ---------- battle ----------
  if (state?.status === "active") {
    return (
      <Battle
        state={state}
        feed={raid.feed}
        myUid={user.uid}
        next={raid.next}
        answer={raid.answer}
      />
    );
  }

  // ---------- lobby ----------
  if (state) {
    const link = `${location.origin}/boss-raids?join=${state.code}`;
    return (
      <div className="mx-auto mt-10 flex max-w-xl flex-col gap-4 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">{state.title}</h1>
          <p className="text-muted-foreground">
            Boss: {state.bossName} · {state.bossMaxHp.toLocaleString()} HP ·{" "}
            {state.questionCount} questions
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Invite your group</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-center font-mono text-4xl tracking-widest">
              {state.code}
            </p>
            <code className="rounded bg-muted p-2 text-xs break-all">
              {link}
            </code>
            <Button
              variant="outline"
              onClick={() => navigator.clipboard.writeText(link)}
            >
              Copy invite link
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Party ({state.players.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {state.players.map((p) => (
              <p key={p.uid}>{p.uid === user.uid ? `${p.name} (you)` : p.name}</p>
            ))}
          </CardContent>
        </Card>

        {error && <p className="text-center text-sm text-red-500">{error}</p>}

        {state.isHost ? (
          <Button onClick={() => run(raid.start)}>Start the raid</Button>
        ) : (
          <p className="animate-pulse text-center text-muted-foreground">
            Waiting for the host to start...
          </p>
        )}
        <Button variant="outline" onClick={raid.leave}>
          Leave
        </Button>
      </div>
    );
  }

  // ---------- create ----------
  if (creating) {
    return (
      <CreateRaid
        onCreate={async (input) => {
          await raid.create(input);
          setCreating(false);
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  // ---------- home ----------
  return (
    <div className="mx-auto mt-10 flex max-w-xl flex-col gap-6 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Boss Raids</h1>
        <p className="text-muted-foreground">
          Team up with your study group and beat the boss together. Every
          correct answer deals damage.
        </p>
      </div>

      {(error || raid.error) && (
        <p className="text-center text-sm text-red-500">
          {error || raid.error}
        </p>
      )}
      {!raid.connected && !raid.error && (
        <p className="animate-pulse text-center text-sm text-muted-foreground">
          Connecting...
        </p>
      )}

      {inviteCode && (
        <Card>
          <CardHeader>
            <CardTitle>You've been invited to a raid</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={() => joinWith(inviteCode)}>
              Join {inviteCode.toUpperCase()}
            </Button>
            <Button variant="outline" onClick={() => setParams({})}>
              Ignore
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Host a raid</CardTitle>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => setCreating(true)}>
            Create a raid
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Join with a code</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            placeholder="6-letter code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="font-mono uppercase"
          />
          <Button disabled={code.length !== 6} onClick={() => joinWith(code)}>
            Join
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}