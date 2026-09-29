import { useEffect, useState } from "react";

export default function useSession() {
  const [session, setSession] = useState({ user: null, loading: true, error: "" });

  useEffect(() => {
    const controller = new AbortController();
    async function loadSession() {
      try {
        const response = await fetch("/djangoapp/session", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Could not check your login session.");
        const data = await response.json();
        if (typeof data.authenticated !== "boolean") {
          throw new Error("Could not check your login session.");
        }
        const user = data.authenticated ? { userName: data.userName } : null;
        if (controller.signal.aborted) return;
        if (user) sessionStorage.setItem("username", user.userName);
        else sessionStorage.removeItem("username");
        setSession({ user, loading: false, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) {
          setSession({ user: null, loading: false, error: "Could not check your login session. Refresh to try again." });
        }
      }
    }
    loadSession();
    return () => controller.abort();
  }, []);

  return session;
}
