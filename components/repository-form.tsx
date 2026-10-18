"use client";

import { useActionState } from "react";

import { submitRepository, type SubmitState } from "@/app/actions/submit-repository";

const initial: SubmitState = null;

export function RepositoryForm() {
  const [state, action, pending] = useActionState(submitRepository, initial);

  return (
    <form action={action} className="brutal-surface flex w-full flex-col gap-3 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Repository</span>
          <input
            name="url"
            type="text"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="https://github.com/owner/name"
            className="workspace-mono w-full border-2 border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="border-2 border-border bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Starting" : "Analyse"}
        </button>
      </div>
      {state?.error ? <p className="text-sm font-semibold text-destructive">{state.error}</p> : null}
    </form>
  );
}
