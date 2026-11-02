import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useUser } from "./firebase";
import { Badge } from "@/components/ui/badge";
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
          : "No decks yet. Upload the first one."
        : "");

  return (
    <div className="mx-auto mt-10 max-w-5xl px-4">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Decks</h1>
          <p className="text-muted-foreground">
            Pick a deck and race other students through it.
          </p>
        </div>
        {user && <Button render={<Link to="/upload" />}>Upload a deck</Button>}
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or author"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setSubject(null)}>
            <Badge variant={subject === null ? "default" : "secondary"}>All</Badge>
          </button>
          {subjects.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSubject(subject === s ? null : s)}
            >
              <Badge variant={subject === s ? "default" : "secondary"}>{s}</Badge>
            </button>
          ))}
          {!loading && !error && (
            <span className="ml-auto text-sm text-muted-foreground">
              {visible.length} of {decks.length} decks
            </span>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {visible.map((d) => (
          <Link
            key={d.id}
            to={`/room/${d.id}`}
            className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0 hover:bg-muted/50"
          >
            <span
              className="h-10 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: subjectColor(d.subject) }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{d.title}</p>
              <p className="truncate text-sm text-muted-foreground">
                by {d.owner}
              </p>
            </div>
            <Badge variant="secondary">{d.subject}</Badge>
            <span className="w-16 text-right text-sm tabular-nums text-muted-foreground">
              {d.cards} cards
            </span>
          </Link>
        ))}
        {status && (
          <p className="px-4 py-8 text-center text-muted-foreground">{status}</p>
        )}
      </div>
    </div>
  );
};

export default Home;