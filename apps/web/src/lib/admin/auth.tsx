"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, hasAccessToken, refreshSession, signOut, type Me } from "./api";

type Auth = { me: Me; can: (permission: string) => boolean; logout: () => Promise<void> };
const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth outside AdminAuth");
  return auth;
}

/** Guards every admin page: restores the session from the refresh cookie or sends the user
 * to the login page. The real permission checks happen in the API; this only shapes the UI. */
export function AdminAuth({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
          },
        },
      }),
  );

  useEffect(() => {
    let live = true;
    (async () => {
      const ok = hasAccessToken() || (await refreshSession());
      const user = ok ? await api<Me>("/auth/me").catch(() => null) : null;
      if (!live) return;
      if (user) setMe(user);
      else router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
    })();
    return () => {
      live = false;
    };
    // Runs once per page load; navigation inside the admin keeps the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!me) return <>{fallback}</>;
  const auth: Auth = {
    me,
    can: (permission) => me.permissions.includes(permission),
    logout: async () => {
      await signOut();
      client.clear();
      router.replace("/admin/login");
    },
  };
  return (
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </AuthContext.Provider>
  );
}
