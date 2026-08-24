// Gate a route to specific roles. A signed-in user who lacks the role is sent to
// their own home (candidates never see the tracker; staff never see the portal).
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { homeFor } from "@/lib/permissions";

export default function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}
