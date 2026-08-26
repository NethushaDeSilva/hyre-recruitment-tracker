// App routing.
//  Public:  "/" (Hyre homepage) and "/login".
//  Private: everything under RequireAuth + AppLayout, gated further by role.
//  "/app" is the post-login redirector that sends each role to its landing page.
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ROLES } from "@/lib/permissions";
import RequireAuth from "@/components/RequireAuth";
import RequireRole from "@/components/RequireRole";
import AppLayout from "@/components/layout/AppLayout";

// Every PAGE is its own chunk, fetched only when its route is actually visited
// — the initial download is App shell + router + auth only, not all ~15 pages'
// code at once. AppLayout (sidebar/topbar) stays a normal import so it's never
// what's "loading": on private routes only the routed page inside <Outlet/>
// suspends, the shell around it stays put.
const Home = lazy(() => import("@/pages/Home"));
const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Positions = lazy(() => import("@/pages/Positions"));
const PositionDetail = lazy(() => import("@/pages/PositionDetail"));
const CandidatesTable = lazy(() => import("@/pages/CandidatesTable"));
const Employees = lazy(() => import("@/pages/Employees"));
const Jobs = lazy(() => import("@/pages/Jobs"));
const MyApplications = lazy(() => import("@/pages/MyApplications"));
const Profile = lazy(() => import("@/pages/Profile"));
const Settings = lazy(() => import("@/pages/Settings"));
const Company = lazy(() => import("@/pages/Company"));
const Team = lazy(() => import("@/pages/Team"));
const Help = lazy(() => import("@/pages/Help"));

const RouteLoading = () => (
  <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Loading…</div>
);

const STAFF = [ROLES.HR, ROLES.INTERVIEWER, ROLES.MANAGEMENT];
const RECRUITERS = [ROLES.HR, ROLES.MANAGEMENT];

export default function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
      <ToastProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<RouteLoading />}>
        <Routes>
          {/* public */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />

          {/* private */}
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/app" element={<Home />} />

            {/* staff — the internal tracker */}
            <Route path="/positions" element={<RequireRole roles={STAFF}><Positions /></RequireRole>} />
            <Route path="/positions/:id" element={<RequireRole roles={STAFF}><PositionDetail /></RequireRole>} />
            <Route path="/candidates" element={<RequireRole roles={RECRUITERS}><CandidatesTable /></RequireRole>} />
            <Route path="/employees" element={<RequireRole roles={RECRUITERS}><Employees /></RequireRole>} />

            {/* candidate — the applicant portal */}
            <Route path="/jobs" element={<RequireRole roles={[ROLES.CANDIDATE]}><Jobs /></RequireRole>} />
            <Route path="/applications" element={<RequireRole roles={[ROLES.CANDIDATE]}><MyApplications /></RequireRole>} />

            {/* company — internal, staff only */}
            <Route path="/company" element={<RequireRole roles={STAFF}><Company /></RequireRole>} />
            <Route path="/team" element={<RequireRole roles={STAFF}><Team /></RequireRole>} />

            {/* everyone */}
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/help" element={<Help />} />
          </Route>

          {/* unknown → homepage */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </ToastProvider>
      </ConfirmProvider>
    </AuthProvider>
  );
}
