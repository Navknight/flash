import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useUser } from "./firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

const chip = (active: boolean) =>
  `rounded-full border px-3.5 py-1 text-sm font-semibold ${active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted"}`;

const Home = () => {
  const user = useUser();
  const [decks, setDecks] = useState<Deck[]>([]);
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
      .catch(() => setError("Could not load decks. Refresh the page to try again."))
      .finally(() => setLoading(false));
  }, []);

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
    <div className="mx-auto mt-10 max-w-6xl px-4 pb-16">
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
        <div className="hidden grid-cols-[1fr_180px_70px_90px] gap-4 border-b px-5 py-2.5 text-sm font-semibold text-muted-foreground sm:grid">
          <span>Deck</span>
          <span>Subject</span>
          <span className="text-right">Cards</span>
          <span />
        </div>
        {visible.map((d) => (
          <div
            key={d.id}
            className="grid grid-cols-[1fr_80px] items-center gap-4 border-b px-5 py-3.5 last:border-b-0 hover:bg-muted/60 sm:grid-cols-[1fr_180px_70px_90px]"
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
          <p className="px-5 py-8 text-center text-muted-foreground">{status}</p>
        )}
      </div>
    </div>
  );
};

export default Home;