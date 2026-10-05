import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useMe } from "../hooks/useMe";
import { useTheme } from "../hooks/useTheme";
import { SKINS, useSkin } from "../hooks/useSkin";
import { Avatar } from "./ui";

const LINKS = [
  { to: "/discover", label: "Discover" },
  { to: "/feed", label: "Feed" },
  { to: "/lists", label: "Lists" },
  { to: "/groups", label: "Groups" },
  { to: "/journal", label: "Journal" },
];

function Logo() {
  return (
    <Link to="/" className="group flex shrink-0 items-center gap-2.5">
      <span className="bg-aurora relative grid h-9 w-9 place-items-center rounded-lg shadow-[0_6px_20px_-6px_var(--g-b)] transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1d1409" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9.5 12 4l9 5.5" />
          <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
          <path d="M3 20.5h18" />
        </svg>
      </span>
      <span className="hidden font-display text-lg font-bold tracking-[0.18em] text-ink min-[420px]:inline">
        ATHENAEUM
      </span>
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className="grid h-9 w-9 place-items-center rounded-full border border-stone bg-vellum-deep text-ink-soft hover:text-ochre hover:border-ochre hover:rotate-12"
    >
      {dark ? (
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}

/** Switch between the app's looks. The first option restores the original. */
function LookMenu() {
  const { skin, setSkin } = useSkin();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change look"
        title="Change look"
        className="grid h-9 w-9 place-items-center rounded-full border border-stone bg-vellum-deep text-ink-soft hover:border-ochre hover:text-ochre"
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.5-1.9-.4-1.3.5-2.6 1.9-2.6H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5Z" />
          <circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="note-settle absolute right-0 z-20 mt-3 w-64 rounded-2xl border border-stone p-1.5"
            style={{ background: "var(--menu-bg)", boxShadow: "var(--elevated-shadow)" }}
          >
            <p className="small-caps px-3 pb-1 pt-2 text-caption font-bold text-ink-soft">Look</p>
            {SKINS.map((s) => (
              <button
                key={s.id}
                role="menuitemradio"
                aria-checked={skin === s.id}
                onClick={() => {
                  setSkin(s.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-vellum-deep"
              >
                <span
                  className="h-7 w-7 shrink-0 rounded-full border border-stone"
                  style={{ background: `linear-gradient(135deg, ${s.swatch[0]} 50%, ${s.swatch[1]} 50%)` }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-uitext font-bold text-ink">{s.name}</span>
                  <span className="block truncate text-caption text-ink-soft">{s.note}</span>
                </span>
                {skin === s.id && <span className="text-terracotta">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Navbar() {
  const { token, logout } = useAuth();
  const { me } = useMe();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const itemClass = ({ isActive }) =>
    `relative rounded-full px-3.5 py-1.5 text-uitext font-semibold ${
      isActive
        ? "bg-aurora text-on-accent shadow-[0_6px_18px_-6px_var(--g-b)]"
        : "text-ink-soft hover:text-ink hover:bg-vellum-deep"
    }`;

  const menuItem =
    "block rounded-lg px-3 py-2 text-uitext text-ink hover:bg-vellum-deep";

  return (
    <header className="nav-wrap sticky top-0 z-30 px-3 pt-3">
      <div
        className="nav-shell mx-auto flex max-w-6xl items-center gap-4 rounded-full border border-stone px-3 py-2 pl-4 backdrop-blur-xl"
        style={{
          background: "var(--nav-bg)",
          boxShadow: "inset 0 1px 0 var(--glass-edge), var(--card-shadow)",
        }}
      >
        <Logo />

        <nav className="ml-3 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={itemClass}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <LookMenu />
          <ThemeToggle />
          {token ? (
            <>
              <Link
                to="/books/new"
                className="btn-aurora small-caps hidden rounded-full px-4 py-2 text-caption font-bold md:inline-flex"
              >
                + Add a Book
              </Link>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full p-0.5 hover:scale-105"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <Avatar user={me ?? { username: "?" }} size={34} />
                </button>
                {menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div
                      role="menu"
                      className="note-settle absolute right-0 z-20 mt-3 w-60 rounded-2xl border border-stone p-1.5 backdrop-blur-xl"
                      style={{ background: "var(--menu-bg)", boxShadow: "var(--elevated-shadow)" }}
                    >
                      {me && (
                        <div className="mb-1 flex items-center gap-2.5 border-b border-stone px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-uitext font-bold text-ink">{me.username}</p>
                            <p className="truncate text-caption text-ink-soft">{me.email}</p>
                          </div>
                        </div>
                      )}
                      {[
                        ["/profile", "My Diary"],
                        ["/lists", "My Lists"],
                        ["/profile/edit", "Edit Profile"],
                      ].map(([to, label]) => (
                        <Link key={to} to={to} onClick={() => setMenuOpen(false)} className={menuItem} role="menuitem">
                          {label}
                        </Link>
                      ))}
                      <Link to="/books/new" onClick={() => setMenuOpen(false)} className={`${menuItem} md:hidden`} role="menuitem">
                        Add a Book
                      </Link>
                      <button
                        onClick={() => {
                          logout();
                          navigate("/login");
                        }}
                        className="block w-full rounded-lg px-3 py-2 text-left text-uitext text-error hover:bg-error/10"
                        role="menuitem"
                      >
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="small-caps whitespace-nowrap px-2 text-caption font-bold text-ink-soft hover:text-ink">
                Sign In
              </Link>
              <Link to="/register" className="btn-aurora small-caps whitespace-nowrap rounded-full px-4 py-2 text-caption font-bold">
                Join
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Phones get the same destinations as a scrollable pill row. */}
      <nav className="mx-auto mt-2 flex max-w-6xl gap-1.5 overflow-x-auto md:hidden">
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} className={(st) => `${itemClass(st)} shrink-0 border border-stone bg-[var(--nav-bg)] backdrop-blur`}>
            {l.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
