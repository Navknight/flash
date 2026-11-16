import { useEffect, useState } from "react";
import { useUser } from "./firebase";
import { tier } from "@/lib/tier";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = {
  uid: string;
  name: string;
  elo: number;
  games: number;
  wins: number;
  losses: number;
};
const MEDALS = ["text-yellow-400", "text-zinc-300", "text-orange-400"];

export default function Leaderboard() {
  const user = useUser();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then(setRows);
  }, []);

  return (
    <div className="mx-auto mt-10 max-w-4xl px-4">
      <h1 className="text-3xl font-bold">Leaderboard</h1>
      <p className="mb-6 text-muted-foreground">
        Ranked duels only. Climb one win at a time.
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          No ranked duels yet. Be the first on the board.
        </p>
      ) : (<>
     <div className="mb-6 grid grid-cols-3 items-end gap-3">
  {[1, 0, 2].map((i) =>
    rows[i] ? (
      <div
        key={rows[i].uid}
        className={`rounded-xl border bg-card p-4 text-center shadow-sm ${i === 0 ? "py-8 border-yellow-400/60" : ""}`}
      >
        <p className="text-3xl">{["🥇", "🥈", "🥉"][i]}</p>
        <p className="mt-2 truncate font-semibold">{rows[i].name}</p>
        <p className="font-mono text-sm text-muted-foreground">{rows[i].elo}</p>
      </div>
    ) : (
      <div key={i} />
    ),
  )}
</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Elo</TableHead>
              <TableHead className="text-right">Record</TableHead>
              <TableHead className="text-right">Win %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const t = tier(r.elo);
              const draws = r.games - r.wins - r.losses;
              return (
                <TableRow
                  key={r.uid}
                  className={r.uid === user?.uid ? "bg-muted/50" : ""}
                >
                  <TableCell
                    className={`font-mono ${MEDALS[i] ?? "text-muted-foreground"}`}
                  >
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    {r.name}
                    {r.uid === user?.uid && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={t.color}>{t.name}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.elo}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.wins}–{r.losses}
                    {draws > 0 && `–${draws}`}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Math.round((100 * r.wins) / r.games)}%
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </>
      )}
    </div>
  );
}
