"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/tasks" : "/login");
  }, [user, loading, router]);

  return (
    <main className="flex flex-1 items-center justify-center text-sm text-muted">Loading…</main>
  );
}
