"use client";

import { useState } from "react";
import { TaskForm } from "./TaskForm";
import { ghostButton } from "./ui";
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
  LOW: "text-muted",
  MEDIUM: "bg-honey-soft text-honey",
  HIGH: "bg-accent-soft text-accent",
};

// Due dates are stored as midnight UTC, so format in UTC to avoid showing the previous day.
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
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
      <li className="rounded-2xl bg-surface p-4 ring-1 ring-accent/40">
        <TaskForm
          initial={task}
          submitLabel="Save"
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
  const overdue = isOverdue(task);

  return (
    <li className="group rounded-2xl bg-surface px-4 py-3.5 ring-1 ring-line transition hover:ring-accent/30">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          disabled={busy}
          onChange={() => run(() => onUpdate(task.id, { status: done ? "TODO" : "DONE" }))}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
          aria-label={done ? "Mark as not done" : "Mark as done"}
        />
        <div className="min-w-0 flex-1">
          <p className={`break-words ${done ? "text-muted line-through decoration-muted/50" : "text-ink"}`}>
            {task.title}
          </p>
          {task.description && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted">
              {task.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <select
              value={task.status}
              disabled={busy}
              onChange={(e) =>
                run(() => onUpdate(task.id, { status: e.target.value as TaskStatus }))
              }
              className="cursor-pointer rounded-md bg-transparent text-muted outline-none hover:text-ink"
              aria-label="Status"
            >
              {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {task.priority !== "LOW" && (
              <span className={`rounded-full px-2 py-0.5 font-medium ${priorityStyles[task.priority]}`}>
                {PRIORITY_LABELS[task.priority]}
              </span>
            )}
            {task.dueDate && (
              <span className={overdue ? "font-medium text-danger" : "text-muted"}>
                {overdue ? "Overdue · " : "Due "}
                {formatDate(task.dueDate)}
              </span>
            )}
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
        <div className="flex shrink-0 gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <button type="button" onClick={() => setEditing(true)} disabled={busy} className={ghostButton}>
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirm(`Delete "${task.title}"?`)) run(() => onDelete(task.id));
            }}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:bg-danger-soft hover:text-danger"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
