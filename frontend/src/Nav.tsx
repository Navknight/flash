import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth, useUser } from "./firebase";
import { tier } from "@/lib/tier";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { HugeiconsIcon } from "@hugeicons/react";
import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";

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
    `border-b-2 py-5 font-bold transition-colors ${isActive ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;
  const t = me && tier(me.elo);

  return (
    <header className="sticky top-0 z-10 h-16 border-b bg-card">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-4 px-4 sm:gap-8">
        <Link
          to="/"
          className="flex items-center gap-2 text-2xl font-black tracking-tight"
        >
          <img src="/logo.svg" alt="" className="h-5 w-6.5" />
          <span className="hidden sm:inline">flash</span>
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
            variant="outline"
            size="icon"
            onClick={toggle}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <HugeiconsIcon icon={theme === "dark" ? Sun03Icon : Moon02Icon} />
          </Button>
          {user ? (
            <>
              {me && t && (
                <span className="hidden items-center gap-2 rounded-full border px-3 py-1 text-sm sm:flex">
                  <span className={`font-extrabold ${t.color}`}>{t.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {me.elo}
                  </span>
                </span>
              )}
              <Link to={`/u/${user.uid}`} aria-label="Your profile">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <span className="text-sm font-bold hover:underline">
                    Profile
                  </span>
                )}
              </Link>
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
