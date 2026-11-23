import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { tier } from "@/lib/tier";
import RankCard from "@/components/RankCard";
import Panel from "@/components/Panel";

type Match = {
  id: string;
  problem: string | null;
  difficulty: string | null;
  ranked: boolean;
  opponent: string;
  opponentUid: string;
  result: "win" | "loss" | "draw";
  delta: number | null;
  createdAt: string;
};
type Profile = {
  uid: string;
  name: string;
  elo: number;
  createdAt: string;
  races: { races: number; questions: number; correct: number };
  duels: { games: number; wins: number; losses: number; draws: number };
  matches: Match[];
  decks: { id: number; title: string; subject: string; cards: number }[];
};

const RESULT = {
  win: "text-good",
  loss: "text-destructive",
  draw: "text-muted-foreground",
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

export default function Profile() {
  const { uid } = useParams();
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setP(null);
    setError("");
    fetch(`/api/users/${uid}`)
      .then((r) => {
        if (r.status === 404) throw new Error("No player with that id.");
        if (!r.ok) throw new Error("Could not load this profile.");
        return r.json();
      })
      .then(setP)
      .catch((e) => setError(e.message));
  }, [uid]);

  if (error)
    return <p className="mt-10 text-center text-muted-foreground">{error}</p>;
  if (!p)
    return (
      <p className="mt-10 text-center text-muted-foreground">Loading...</p>
    );

  const t = tier(p.elo);
  const { races, duels } = p;
  const accuracy = races.questions
    ? Math.round((100 * races.correct) / races.questions)
    : 0;
  const stats = [
    { label: "Questions answered", value: races.questions },
    { label: "Accuracy", value: races.questions ? `${accuracy}%` : "-" },
    { label: "Races", value: races.races },
    {
      label: "Duels (W-L-D)",
      value: `${duels.wins}-${duels.losses}-${duels.draws}`,
    },
  ];

  return (
    <div className="mx-auto mt-10 max-w-6xl px-4 pb-16">
      <h1 className="text-4xl font-extrabold">{p.name}</h1>
      <p className="mt-1 text-muted-foreground">
        <span className={`font-extrabold ${t.color}`}>{t.name}</span>{" "}
        <span className="tabular-nums">{p.elo}</span>, joined{" "}
        {new Date(p.createdAt).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card px-5 py-4">
            <p className="text-3xl font-light tabular-nums">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="with-sidebar mt-8">
        <section className="min-w-0">
          <h2 className="mb-3 text-xl font-extrabold">Recent duels</h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            {p.matches.length === 0 ? (
              <p className="px-5 py-8 text-center text-muted-foreground">
                No duels yet.
              </p>
            ) : (
              <table className="w-full text-left">
                <thead className="text-sm text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Result</th>
                    <th className="px-5 py-2.5 font-semibold">Problem</th>
                    <th className="px-5 py-2.5 font-semibold">Opponent</th>
                    <th className="px-5 py-2.5 text-right font-semibold">
                      Elo
                    </th>
                    <th className="px-5 py-2.5 text-right font-semibold">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.matches.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td
                        className={`px-5 py-3 font-bold capitalize ${RESULT[m.result]}`}
                      >
                        {m.result}
                      </td>
                      <td className="px-5 py-3">
                        {m.problem ?? "Unknown"}
                        {m.difficulty && (
                          <span className="ml-2 text-sm text-muted-foreground">
                            {m.difficulty}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          to={`/u/${m.opponentUid}`}
                          className="font-semibold hover:underline"
                        >
                          {m.opponent}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {m.ranked && m.delta !== null
                          ? `${m.delta > 0 ? "+" : ""}${m.delta}`
                          : "unrated"}
                      </td>
                      <td className="px-5 py-3 text-right text-muted-foreground">
                        {day(m.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-5">
          <RankCard elo={p.elo} />
          <Panel title="Decks">
            {p.decks.length === 0 && (
              <p className="text-muted-foreground">No decks uploaded.</p>
            )}
            <div className="flex flex-col gap-3">
              {p.decks.map((d) => (
                <Link
                  key={d.id}
                  to={`/room/${d.id}`}
                  className="flex justify-between gap-3 hover:underline"
                >
                  <span className="truncate font-semibold">{d.title}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {d.cards} cards
                  </span>
                </Link>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
