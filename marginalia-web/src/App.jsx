import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import { Meander } from "./components/Motifs";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Discover from "./pages/Discover";
import AddBook from "./pages/AddBook";
import BookDetail from "./pages/BookDetail";
import LogComposer from "./pages/LogComposer";
import ReviewPage from "./pages/ReviewPage";
import Profile from "./pages/Profile";
import Feed from "./pages/Feed";
import Lists from "./pages/Lists";
import ListDetail from "./pages/ListDetail";
import Groups from "./pages/Groups";
import GroupHall from "./pages/GroupHall";
import Scriptorium from "./pages/Scriptorium";
import Agora from "./pages/Agora";
import Journal from "./pages/Journal";
import JournalEntry from "./pages/JournalEntry";
import JournalEditor from "./pages/JournalEditor";

function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 text-center">
      <p className="text-aurora font-display text-[9rem] font-bold leading-none sm:text-[12rem]">404</p>
      <h1 className="-mt-4 font-display text-page">Lost in the stacks</h1>
      <p className="mt-3 text-body text-ink-soft">
        This page isn't catalogued anywhere.
      </p>
      <Link
        to="/discover"
        className="btn-aurora small-caps mt-8 inline-block rounded-full px-6 py-3 text-uitext font-bold"
      >
        Back to Discover
      </Link>
    </div>
  );
}

export default function App() {
  const location = useLocation();

  // Page-level navigation is a subtle cross-fade, never a slide.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main
        key={location.pathname}
        className="flex-1"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "none" : "translateY(8px)",
          transition: "opacity 260ms ease-out, transform 260ms ease-out",
        }}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Public reads, matching the backend's public-GET-everything split */}
          <Route path="/discover" element={<Discover />} />
          <Route path="/books/:bookId" element={<BookDetail />} />
          <Route path="/logs/:logId" element={<ReviewPage />} />
          <Route path="/users/:userId" element={<Profile />} />
          <Route path="/lists" element={<Lists />} />
          <Route path="/lists/:listId" element={<ListDetail />} />

          {/* Groups: browsing is public, speaking and convening need a token */}
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:groupId" element={<GroupHall />} />
          <Route
            path="/groups/:groupId/chat"
            element={
              <ProtectedRoute>
                <Scriptorium />
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups/:groupId/agora"
            element={
              <ProtectedRoute>
                <Agora />
              </ProtectedRoute>
            }
          />

          {/* The Journal: reading is public, writing needs a token. /new is
              declared before /:entryId so "new" isn't read as an id. */}
          <Route path="/journal" element={<Journal />} />
          <Route
            path="/journal/new"
            element={
              <ProtectedRoute>
                <JournalEditor />
              </ProtectedRoute>
            }
          />
          <Route path="/journal/:entryId" element={<JournalEntry />} />
          <Route
            path="/journal/:entryId/edit"
            element={
              <ProtectedRoute>
                <JournalEditor />
              </ProtectedRoute>
            }
          />

          {/* Writing requires a token */}
          <Route
            path="/books/new"
            element={
              <ProtectedRoute>
                <AddBook />
              </ProtectedRoute>
            }
          />
          <Route
            path="/books/:bookId/log"
            element={
              <ProtectedRoute>
                <LogComposer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/logs/:logId/edit"
            element={
              <ProtectedRoute>
                <LogComposer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/feed"
            element={
              <ProtectedRoute>
                <Feed />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/edit"
            element={
              <ProtectedRoute>
                <Profile editing />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="mt-20">
        <Meander />
        <div className="mx-auto max-w-6xl px-4 py-8 text-center text-caption text-ink-soft">
          <span className="text-aurora font-display text-base font-bold">Athenaeum</span>
          <span className="mx-2 opacity-50">·</span>a library, a reading room,
          and an argument about books, all under one roof.
        </div>
      </footer>
    </div>
  );
}
