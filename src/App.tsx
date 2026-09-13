import { Navigate, Outlet, Route, Routes, Link } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Debrief from "./pages/Debrief";
import History from "./pages/History";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Practice from "./pages/Practice";
import "./App.css";

function RequireAuth() {
  const { ready, user } = useAuth();
  if (!ready) {
    return (
      <main className="stage">
        <p className="empty">Loading your profile…</p>
      </main>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function Shell() {
  const { user, logout } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand-link">
          LinguaSure
        </Link>
        <nav>
          <Link to="/">Situations</Link>
          <Link to="/history">History</Link>
          {user?.picture ? <img src={user.picture} alt="" className="avatar" referrerPolicy="no-referrer" /> : null}
          <span>{user?.name}</span>
          <button type="button" className="ghost compact" onClick={() => void logout()}>
            Sign out
          </button>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

export default function App({ googleClientId }: { googleClientId: string }) {
  return (
    <Routes>
      <Route path="/login" element={<Login googleClientId={googleClientId} />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/practice/:sessionId" element={<Practice />} />
          <Route path="/debrief/:sessionId" element={<Debrief />} />
          <Route path="/history" element={<History />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
