// Index redirect — sends each signed-in user to the right landing page for their
// role (candidates → job board, staff → positions, management → dashboard).
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { homeFor } from "@/lib/permissions";

export default function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.role) : "/login"} replace />;
}
