"use client";

import { useState } from "react";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Task,
  type TaskInput,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";
import { errorBox, fieldClass, ghostButton, primaryButton } from "./ui";

interface TaskFormProps {
  initial?: Task;
  submitLabel: string;
  onSubmit: (input: TaskInput) => Promise<void>;
  onCancel?: () => void;
}

export function TaskForm({ initial, submitLabel, onSubmit, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? "TODO");
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? "MEDIUM");
  // The API returns ISO timestamps. A date input needs just the YYYY-MM-DD part.
  const [dueDate, setDueDate] = useState(initial?.dueDate?.slice(0, 10) ?? "");
  // New tasks start as a single line. Editing shows every field.
  const [showDetails, setShowDetails] = useState(Boolean(initial));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        dueDate: dueDate || null,
      });
      if (!initial) {
        setTitle("");
        setDescription("");
        setStatus("TODO");
        setPriority("MEDIUM");
        setDueDate("");
        setShowDetails(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input
          className={fieldClass}
          placeholder="What's on your mind?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          aria-label="Task title"
        />
        {!initial && (
          <button type="submit" disabled={submitting} className={`${primaryButton} shrink-0`}>
            {submitting ? "Adding…" : submitLabel}
          </button>
        )}
      </div>

      {!initial && !showDetails && (
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="text-xs text-muted transition hover:text-teal"
        >
          + Add details, priority or a due date
        </button>
      )}

      {showDetails && (
        <>
          <textarea
            className={`${fieldClass} min-h-20 resize-y`}
            placeholder="A few more details (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Description"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs text-muted">Status</span>
              <select
                className={fieldClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted">Priority</span>
              <select
                className={fieldClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted">Due date</span>
              <input
                type="date"
                className={fieldClass}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
          </div>
        </>
      )}

      {error && <p className={errorBox}>{error}</p>}

      {initial && (
        <div className="flex justify-end gap-2 pt-1">
          {onCancel && (
            <button type="button" onClick={onCancel} className={ghostButton}>
              Cancel
            </button>
          )}
          <button type="submit" disabled={submitting} className={primaryButton}>
            {submitting ? "Saving…" : submitLabel}
          </button>
        </div>
      )}
    </form>
  );
}
