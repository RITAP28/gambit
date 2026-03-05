// ProtectedRoute.tsx
import type { JSX } from "react";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ isAuthenticated, children }: { isAuthenticated: boolean, children: JSX.Element }) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

export default ProtectedRoute;