import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth, useUser } from "./firebase";
import { tier } from "@/lib/tier";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

export default function Nav() {
  const user = useUser();
  const { pathname } = useLocation();
  const [me, setMe] = useState<{ name: string; elo: number } | null>(null);
  const { theme, toggle } = useTheme();

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
    `border-b-2 py-5 text-sm transition-colors ${isActive ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;
  const t = me && tier(me.elo);

  return (
    <header className="sticky top-0 z-10 h-16 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-4 px-4 sm:gap-8">
        <Link to="/" className="text-xl font-bold tracking-tight text-primary">
          ⚡<span className="hidden sm:inline"> flash</span>
        </Link>
        <nav className="flex gap-4 sm:gap-6">
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggle}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </Button>
          {user ? (
            <>
              {me && t && (
                <span className="hidden items-center gap-2 rounded-full sm:flex border bg-card px-3 py-1 text-sm">
                  <span className={`font-medium ${t.color}`}>{t.name}</span>
                  <span className="tabular-nums text-muted-foreground">
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
