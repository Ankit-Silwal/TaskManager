"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiError, createTask, deleteTask, getTaskCounts, listTasks, updateTask } from "@/lib/api";
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
  // `tasks` holds only the pages loaded so far for the current tab, not every task the user has.
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState<Record<TaskStatus, number>>({ TODO: 0, IN_PROGRESS: 0, DONE: 0 });
  const [filter, setFilter] = useState<Filter>("ALL");
  const [fetching, setFetching] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The tab the latest request belongs to, so a slow "load more" can't add tasks to a tab the user already left.
  const filterRef = useRef<Filter>(filter);

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

  const showError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Something went wrong");
  }, []);

  const refreshCounts = useCallback(() => {
    getTaskCounts()
      .then(setCounts)
      .catch((err) => handleError(err).catch(showError));
  }, [handleError, showError]);

  useEffect(() => {
    if (user) refreshCounts();
  }, [user, refreshCounts]);

  // First page of the selected tab. Runs again whenever the tab changes.
  useEffect(() => {
    if (!user) return;
    filterRef.current = filter;
    let cancelled = false;
    listTasks({ status: filter === "ALL" ? undefined : filter })
      .then((page) => {
        if (cancelled) return;
        setTasks(page.tasks);
        setHasMore(page.nextCursor !== null);
      })
      .catch((err) =>
        handleError(err).catch((e) => {
          if (!cancelled) showError(e);
        }),
      )
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, filter, handleError, showError]);

  function selectFilter(next: Filter) {
    if (next === filter) return;
    setFetching(true);
    setError(null);
    setTasks([]);
    setHasMore(false);
    setFilter(next);
  }

  async function handleLoadMore() {
    const requestedFilter = filter;
    // Continue after the last task on screen. Using it (rather than the last nextCursor) keeps working
    // even if the user deleted that task in the meantime.
    const last = tasks.at(-1);
    setLoadingMore(true);
    try {
      const page = await listTasks({
        status: requestedFilter === "ALL" ? undefined : requestedFilter,
        cursor: last?.id,
      });
      if (filterRef.current !== requestedFilter) return;
      setTasks((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...page.tasks.filter((t) => !seen.has(t.id))];
      });
      setHasMore(page.nextCursor !== null);
    } catch (err) {
      await handleError(err).catch(showError);
    } finally {
      setLoadingMore(false);
    }
  }

  // Whether a task belongs in the list for the current tab.
  function inCurrentTab(task: Task) {
    return filter === "ALL" || task.status === filter;
  }

  async function handleCreate(input: TaskInput) {
    try {
      const task = await createTask(input);
      if (inCurrentTab(task)) setTasks((prev) => [task, ...prev]);
      refreshCounts();
    } catch (err) {
      await handleError(err);
    }
  }

  async function handleUpdate(id: string, input: Partial<TaskInput>) {
    try {
      const updated = await updateTask(id, input);
      // A status change can move the task out of the current tab.
      setTasks((prev) =>
        prev.flatMap((t) => (t.id !== id ? [t] : inCurrentTab(updated) ? [updated] : [])),
      );
      if (input.status !== undefined) refreshCounts();
    } catch (err) {
      await handleError(err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      refreshCounts();
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

  // Counts come from the server (GET /api/tasks/counts), because the page only holds the tasks loaded so far.
  const tabCounts: Record<Filter, number> = {
    ALL: counts.TODO + counts.IN_PROGRESS + counts.DONE,
    ...counts,
  };
  const remaining = counts.TODO + counts.IN_PROGRESS;
  const visible = tasks;
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
              ? tabCounts.ALL === 0
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
                onClick={() => selectFilter(f)}
                aria-pressed={filter === f}
                className={`rounded-full px-3 py-1 text-sm transition ${
                  filter === f
                    ? "bg-teal-soft font-medium text-teal"
                    : "text-muted hover:text-ink"
                }`}
              >
                {f === "ALL" ? "All" : STATUS_LABELS[f]}
                <span className="ml-1.5 opacity-60">{tabCounts[f]}</span>
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
            <>
              <ul className="space-y-2">
                {visible.map((task) => (
                  <TaskItem key={task.id} task={task} onUpdate={handleUpdate} onDelete={handleDelete} />
                ))}
              </ul>
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className={ghostButton}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
