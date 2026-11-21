import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useUser } from "./firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RankCard from "@/components/RankCard";
import Panel from "@/components/Panel";

type Deck = {
  id: number;
  title: string;
  subject: string;
  owner: string;
  cards: number;
};

// same subject always gets the same colour
const subjectColor = (subject: string) => {
  let sum = 0;
  for (const ch of subject) sum += ch.charCodeAt(0);
  return `hsl(${(sum * 37) % 360} 60% 55%)`;
};

const DUELS = [
  { name: "Easy", minutes: 15, color: "text-green-700 dark:text-green-400" },
  {
    name: "Medium",
    minutes: 20,
    color: "text-yellow-700 dark:text-yellow-400",
  },
  { name: "Hard", minutes: 25, color: "text-red-700 dark:text-red-400" },
];

const chip = (active: boolean) =>
  `rounded-full border px-3.5 py-1 text-sm font-semibold ${active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted"}`;

const Home = () => {
  const user = useUser();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [elo, setElo] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // React concept: controlled input. The text box shows whatever "query" holds,
  // and typing calls setQuery, so state and screen never disagree.
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<string | null>(null); // null = all subjects

  useEffect(() => {
    fetch("/api/decks")
      .then((r) => {
        if (!r.ok) throw new Error("bad response");
        return r.json();
      })
      .then(setDecks)
      .catch(() =>
        setError("Could not load decks. Refresh the page to try again."),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return setElo(null);
    user
      .getIdToken()
      .then((token) =>
        fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } }),
      )
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setElo(me?.elo ?? null));
  }, [user]);

  // React concept: derived state. Do not store the filtered list in its own
  // useState, compute it from decks + query + subject. useMemo caches the
  // result until one of those three changes.
  const subjects = useMemo(
    () => [...new Set(decks.map((d) => d.subject))].sort(),
    [decks],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return decks.filter(
      (d) =>
        (!subject || d.subject === subject) &&
        (!q || `${d.title} ${d.owner}`.toLowerCase().includes(q)),
    );
  }, [decks, query, subject]);

  const status = loading
    ? "Loading decks..."
    : error ||
      (visible.length === 0
        ? decks.length
          ? "No decks match your search."
          : "No decks yet."
        : "");

  return (
    <div className="with-sidebar mx-auto mt-10 max-w-6xl px-4 pb-16">
      <section className="min-w-0">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h1 className="text-4xl font-extrabold">Decks</h1>
          {user && (
            <Button variant="outline" render={<Link to="/upload" />}>
              Upload deck
            </Button>
          )}
        </div>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search decks"
          aria-label="Search decks"
          className="h-11 bg-card text-base"
        />
        <div className="mt-3 mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubject(null)}
            className={chip(subject === null)}
          >
            All
          </button>
          {subjects.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSubject(subject === s ? null : s)}
              className={chip(subject === s)}
            >
              {s}
            </button>
          ))}
          {!loading && !error && (
            <span className="ml-auto text-sm text-muted-foreground">
              {visible.length} decks
            </span>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="deck-row hidden border-b px-5 py-2.5 text-sm font-semibold text-muted-foreground sm:grid">
            <span>Deck</span>
            <span>Subject</span>
            <span className="text-right">Cards</span>
            <span />
          </div>
          {visible.map((d) => (
            <div
              key={d.id}
              className="deck-row border-b px-5 py-3.5 last:border-b-0 hover:bg-muted/60"
            >
              <div className="min-w-0">
                <p className="truncate text-base font-bold">{d.title}</p>
                <p className="text-sm text-muted-foreground">by {d.owner}</p>
              </div>
              <span className="hidden items-center gap-2 sm:flex">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ background: subjectColor(d.subject) }}
                />
                <span className="truncate">{d.subject}</span>
              </span>
              <span className="hidden text-right tabular-nums text-muted-foreground sm:block">
                {d.cards}
              </span>
              <Button render={<Link to={`/room/${d.id}`} />}>Race</Button>
            </div>
          ))}
          {status && (
            <p className="px-5 py-8 text-center text-muted-foreground">
              {status}
            </p>
          )}
        </div>
      </section>

      <aside className="flex flex-col gap-5">
        <Panel title="Duel">
          <div className="grid grid-cols-3 gap-2">
            {DUELS.map((d) => (
              <Link
                key={d.name}
                to="/duels"
                className="flex flex-col items-center rounded-lg border py-3 hover:bg-muted"
              >
                <span className="text-3xl leading-none font-light tabular-nums">
                  {d.minutes}
                </span>
                <span className={`text-sm font-extrabold ${d.color}`}>
                  {d.name}
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-2 mb-4 text-xs text-muted-foreground">
            Time limit in minutes
          </p>
          <Button className="h-10 w-full" render={<Link to="/duels" />}>
            Ranked match
          </Button>
          <Link
            to="/duels"
            className="mt-3 block text-center text-sm font-bold hover:underline"
          >
            Challenge a friend
          </Link>
        </Panel>
        {elo !== null && <RankCard elo={elo} />}
      </aside>
    </div>
  );
};

export default Home;
