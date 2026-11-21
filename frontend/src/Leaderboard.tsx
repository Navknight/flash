import { useEffect, useState } from "react";
import { Link } from "react-router";
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
// podium heights for 1st, 2nd, 3rd
const STEPS = [
  "h-52 border-yellow-400 bg-yellow-100 dark:bg-yellow-500/15",
  "h-40 bg-card",
  "h-32 bg-card",
];

export default function Leaderboard() {
  const user = useUser();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then(setRows);
  }, []);

  return (
    <div className="mx-auto mt-10 max-w-4xl px-4 pb-16">
      <h1 className="text-4xl font-extrabold">Leaderboard</h1>
      <p className="mb-8 text-muted-foreground">Ranked duels only.</p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No ranked duels yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 items-end gap-2.5 border-b-2 border-foreground">
            {[1, 0, 2].map((i) => {
              const r = rows[i];
              if (!r) return <div key={i} />;
              const t = tier(r.elo);
              return (
                <div
                  key={r.uid}
                  className={`flex flex-col items-center rounded-t-xl border border-b-0 pt-4 ${STEPS[i]}`}
                >
                  <span
                    className={`leading-none font-extralight ${i === 0 ? "text-6xl" : "text-5xl"}`}
                  >
                    {i + 1}
                  </span>
                  <Link
                    to={`/u/${r.uid}`}
                    className="mt-1.5 max-w-full truncate px-2 text-lg font-extrabold hover:underline"
                  >
                    {r.name}
                  </Link>
                  <span className={`text-sm font-bold ${t.color}`}>
                    {t.name} {r.elo}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="overflow-x-auto rounded-b-xl border border-t-0 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 pl-5">Rank</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Elo</TableHead>
                  <TableHead className="text-right">W-L</TableHead>
                  <TableHead className="pr-5 text-right">Win rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const t = tier(r.elo);
                  const draws = r.games - r.wins - r.losses;
                  const mine = r.uid === user?.uid;
                  return (
                    <TableRow
                      key={r.uid}
                      className={
                        mine ? "bg-yellow-100 dark:bg-yellow-500/15" : ""
                      }
                    >
                      <TableCell className="pl-5 text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-bold">
                        <Link to={`/u/${r.uid}`} className="hover:underline">
                          {r.name}
                        </Link>
                        {mine && (
                          <span className="ml-2 text-sm font-semibold text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={`font-bold ${t.color}`}>
                        {t.name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.elo}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.wins}-{r.losses}
                        {draws > 0 && `-${draws}`}
                      </TableCell>
                      <TableCell className="pr-5 text-right tabular-nums">
                        {Math.round((100 * r.wins) / r.games)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
