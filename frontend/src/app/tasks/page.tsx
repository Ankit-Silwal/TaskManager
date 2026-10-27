"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiError, createTask, deleteTask, listTasks, updateTask } from "@/lib/api";
import { STATUS_LABELS, type Task, type TaskInput, type TaskStatus } from "@/lib/types";
import { TaskForm } from "@/components/TaskForm";
import { TaskItem } from "@/components/TaskItem";

type Filter = "ALL" | TaskStatus;

const FILTERS: Filter[] = ["ALL", "TODO", "IN_PROGRESS", "DONE"];

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
      <main className="flex flex-1 items-center justify-center text-sm text-slate-500">
        Loading…
      </main>
    );
  }

  const counts: Record<Filter, number> = {
    ALL: tasks.length,
    TODO: tasks.filter((t) => t.status === "TODO").length,
    IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    DONE: tasks.filter((t) => t.status === "DONE").length,
  };
  const visible = filter === "ALL" ? tasks : tasks.filter((t) => t.status === filter);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="font-semibold tracking-tight">Task Manager</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">{user.name}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <h2 className="mb-3 text-sm font-semibold">New task</h2>
          <TaskForm submitLabel="Add task" onSubmit={handleCreate} />
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                  filter === f
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800"
                }`}
              >
                {f === "ALL" ? "All" : STATUS_LABELS[f]}
                <span className="ml-1.5 opacity-70">{counts[f]}</span>
              </button>
            ))}
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </p>
          )}

          {fetching ? (
            <p className="py-10 text-center text-sm text-slate-500">Loading tasks…</p>
          ) : visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
              {filter === "ALL" ? "No tasks yet. Add your first one above." : "No tasks with this status."}
            </p>
          ) : (
            <ul className="space-y-3">
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
