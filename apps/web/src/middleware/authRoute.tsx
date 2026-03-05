// AuthRoute.tsx
import type { JSX } from "react";
import { Navigate } from "react-router-dom";

const AuthRoute = ({ id, isAuthenticated, children }: { id: string, isAuthenticated: boolean, children: JSX.Element }) => {
  if (isAuthenticated) {
    console.log("auth route");
    return <Navigate to={`/source/${id}`} replace />;
  }
  return children;
};

export default AuthRoute;