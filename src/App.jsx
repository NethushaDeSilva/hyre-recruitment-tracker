// App routing.
//  Public:  "/" (Hyre homepage) and "/login".
//  Private: everything under RequireAuth + AppLayout, gated further by role.
//  "/app" is the post-login redirector that sends each role to its landing page.
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ROLES } from "@/lib/permissions";
import RequireAuth from "@/components/RequireAuth";
import RequireRole from "@/components/RequireRole";
import AppLayout from "@/components/layout/AppLayout";
import Home from "@/pages/Home";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Positions from "@/pages/Positions";
import PositionDetail from "@/pages/PositionDetail";
import CandidatesTable from "@/pages/CandidatesTable";
import Employees from "@/pages/Employees";
import Jobs from "@/pages/Jobs";
import MyApplications from "@/pages/MyApplications";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import Company from "@/pages/Company";
import Team from "@/pages/Team";
import Help from "@/pages/Help";

const STAFF = [ROLES.HR, ROLES.INTERVIEWER, ROLES.MANAGEMENT];
const RECRUITERS = [ROLES.HR, ROLES.MANAGEMENT];

export default function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
      <ToastProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      </BrowserRouter>
      </ToastProvider>
      </ConfirmProvider>
    </AuthProvider>
  );
}
