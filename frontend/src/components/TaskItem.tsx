"use client";

import { useState } from "react";
import { TaskForm } from "./TaskForm";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Task,
  type TaskInput,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";

interface TaskItemProps {
  task: Task;
  onUpdate: (id: string, input: Partial<TaskInput>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const priorityStyles: Record<TaskPriority, string> = {
  LOW: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  HIGH: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
};

// Due dates are stored as midnight UTC, so format in UTC to avoid showing the previous day.
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function isOverdue(task: Task) {
  if (!task.dueDate || task.status === "DONE") return false;
  const today = new Date().toISOString().slice(0, 10);
  return task.dueDate.slice(0, 10) < today;
}

export function TaskItem({ task, onUpdate, onDelete }: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-xl border border-indigo-300 bg-white p-4 shadow-sm dark:border-indigo-800 dark:bg-slate-900/60">
        <TaskForm
          initial={task}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            await onUpdate(task.id, input);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  const done = task.status === "DONE";

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          disabled={busy}
          onChange={() => run(() => onUpdate(task.id, { status: done ? "TODO" : "DONE" }))}
          className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
          aria-label={done ? "Mark as not done" : "Mark as done"}
        />
        <div className="min-w-0 flex-1">
          <p className={`font-medium break-words ${done ? "text-slate-400 line-through" : ""}`}>
            {task.title}
          </p>
          {task.description && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-500">
              {task.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-medium ${priorityStyles[task.priority]}`}>
              {PRIORITY_LABELS[task.priority]}
            </span>
            <select
              value={task.status}
              disabled={busy}
              onChange={(e) =>
                run(() => onUpdate(task.id, { status: e.target.value as TaskStatus }))
              }
              className="rounded-full border border-slate-200 bg-transparent px-2 py-0.5 dark:border-slate-700"
              aria-label="Status"
            >
              {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {task.dueDate && (
              <span className={isOverdue(task) ? "font-medium text-red-600 dark:text-red-400" : "text-slate-500"}>
                {isOverdue(task) ? "Overdue · " : "Due "}
                {formatDate(task.dueDate)}
              </span>
            )}
          </div>
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirm(`Delete "${task.title}"?`)) run(() => onDelete(task.id));
            }}
            className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
