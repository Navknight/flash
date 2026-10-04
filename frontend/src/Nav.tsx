import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth, useUser } from "./firebase";
import { tier } from "@/lib/tier";
import { Button } from "@/components/ui/button";

export default function Nav() {
  const user = useUser();
  const { pathname } = useLocation();
  const [me, setMe] = useState<{ name: string; elo: number } | null>(null);

  // /api/me also creates the users row on first login, so it must run for every signed-in user.
  // Re-fetching on navigation keeps the Elo fresh after a duel.
  useEffect(() => {
    if (!user) return setMe(null);
    user
      .getIdToken()
      .then((token) =>
        fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } }),
      )
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe);
  }, [user, pathname]);

  const link = ({ isActive }: { isActive: boolean }) =>
    `text-sm transition-colors ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`;
  const t = me && tier(me.elo);

  return (
    <header className="sticky top-0 z-10 h-16 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-8 px-4">
        <Link to="/" className="text-lg font-bold">
          ⚡ flash
        </Link>
        <nav className="flex gap-6">
          <NavLink to="/" end className={link}>
            Decks
          </NavLink>
          <NavLink to="/duels" className={link}>
            Duels
          </NavLink>
          <NavLink to="/leaderboard" className={link}>
            Leaderboard
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              {me && t && (
                <span className="text-sm">
                  <span className={t.color}>{t.name}</span>{" "}
                  <span className="font-mono text-muted-foreground">
                    {me.elo}
                  </span>
                </span>
              )}
              {user.photoURL && (
                <img
                  src={user.photoURL}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 rounded-full"
                />
              )}
              <Button variant="ghost" size="sm" onClick={() => signOut(auth)}>
                Log out
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
            >
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
