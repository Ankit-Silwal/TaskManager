"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiError, createTask, deleteTask, listTasks, updateTask } from "@/lib/api";
import { STATUS_LABELS, type Task, type TaskInput, type TaskStatus } from "@/lib/types";
import { TaskForm } from "@/components/TaskForm";
import { TaskItem } from "@/components/TaskItem";
import { errorBox, ghostButton } from "@/components/ui";

type Filter = "ALL" | TaskStatus;

const FILTERS: Filter[] = ["ALL", "TODO", "IN_PROGRESS", "DONE"];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function TasksPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // If the session can't be refreshed, the API keeps returning 401. Send the user back to login.
  const handleError = useCallback(
    async (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }
      throw err;
    },
    [logout, router],
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listTasks()
      .then((data) => {
        if (!cancelled) setTasks(data);
      })
      .catch((err) =>
        handleError(err).catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Could not load tasks");
        }),
      )
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, handleError]);

  async function handleCreate(input: TaskInput) {
    try {
      const task = await createTask(input);
      setTasks((prev) => [task, ...prev]);
    } catch (err) {
      await handleError(err);
    }
  }

  async function handleUpdate(id: string, input: Partial<TaskInput>) {
    try {
      const updated = await updateTask(id, input);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      await handleError(err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      await handleError(err);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-muted">Loading…</main>
    );
  }

  const counts: Record<Filter, number> = {
    ALL: tasks.length,
    TODO: tasks.filter((t) => t.status === "TODO").length,
    IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    DONE: tasks.filter((t) => t.status === "DONE").length,
  };
  const remaining = counts.ALL - counts.DONE;
  const visible = filter === "ALL" ? tasks : tasks.filter((t) => t.status === filter);
  const firstName = user.name.split(" ")[0];

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 pt-6">
        <div className="flex items-center gap-2 text-sm font-medium text-muted">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
          Task Manager
        </div>
        <button type="button" onClick={handleLogout} className={ghostButton}>
          Log out
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-12">
        <h1 className="font-serif text-3xl text-ink sm:text-4xl">
          {greeting()}, {firstName}.
        </h1>
        <p className="mt-2 text-muted">
          {fetching
            ? "Gathering your tasks…"
            : remaining === 0
              ? counts.ALL === 0
                ? "Nothing on your plate yet."
                : "Everything's done. Enjoy the quiet."
              : `You have ${remaining} ${remaining === 1 ? "thing" : "things"} left to do.`}
        </p>

        <section className="mt-10">
          <TaskForm submitLabel="Add" onSubmit={handleCreate} />
        </section>

        <section className="mt-10 space-y-4">
          <nav className="flex flex-wrap gap-1" aria-label="Filter tasks">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded-full px-3 py-1 text-sm transition ${
                  filter === f
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-muted hover:text-ink"
                }`}
              >
                {f === "ALL" ? "All" : STATUS_LABELS[f]}
                <span className="ml-1.5 opacity-60">{counts[f]}</span>
              </button>
            ))}
          </nav>

          {error && <p className={errorBox}>{error}</p>}

          {fetching ? null : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
              <p className="font-serif text-lg text-ink">
                {filter === "ALL" ? "A fresh start." : "Nothing here."}
              </p>
              <p className="mt-1 text-sm text-muted">
                {filter === "ALL"
                  ? "Add your first task above."
                  : `No tasks are marked ${STATUS_LABELS[filter as TaskStatus].toLowerCase()}.`}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map((task) => (
                <TaskItem key={task.id} task={task} onUpdate={handleUpdate} onDelete={handleDelete} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
