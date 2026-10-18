"use client";

import { useEffect, useState, type FormEvent } from "react";

type ToolStep = { name: string; input: string; paths: string[] };

type Turn = { role: "user" | "assistant"; text: string; tools: ToolStep[] };

export function AskPanel(props: { analysisId: string; selected: string | null }) {
  const storageKey = `gv-ask:${props.analysisId}`;
  const [threadId, setThreadId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setThreadId(window.sessionStorage.getItem(storageKey));
  }, [storageKey]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || pending) return;
    setDraft("");
    setError(null);
    setPending(true);
    setTurns((current) => [...current, { role: "user", text: question, tools: [] }, { role: "assistant", text: "", tools: [] }]);
    try {
      const response = await fetch(`/dashboard/analyses/${props.analysisId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, threadId, selected: props.selected }),
      });
      if (!response.ok || !response.body) {
        const message = await readError(response);
        setError(message);
        return;
      }
      await readStream(response.body, (event, data) => {
        if (event === "tool") {
          const name = stringField(data, "name") ?? "tool";
          const input = stringField(data, "input") ?? "";
          appendTool(name, input);
        } else if (event === "paths") {
          const name = stringField(data, "name") ?? "tool";
          const returned = stringArray(data, "paths");
          attachPaths(name, returned);
        } else if (event === "text") {
          const text = stringField(data, "text") ?? "";
          if (text) appendText(text);
        } else if (event === "done") {
          const next = stringField(data, "threadId");
          if (next) {
            setThreadId(next);
            window.sessionStorage.setItem(storageKey, next);
          }
        } else if (event === "error") {
          setError(stringField(data, "error") ?? "The agent stopped.");
        }
      });
    } catch {
      setError("The agent isn't running. The map still works.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ask-panel">
      <div className="ask-log" aria-live="polite">
        {turns.length === 0 ? (
          <p className="ask-empty">Ask about this repository. The steps show up as it looks them up.</p>
        ) : null}
        {turns.map((turn, index) => (
          <div key={index} className={turn.role === "user" ? "ask-user" : "ask-assistant"}>
            {turn.tools.map((tool, toolIndex) => (
              <div key={toolIndex} className="ask-tool">
                <p>
                  {tool.name}
                  {tool.input ? <span> {tool.input}</span> : null}
                </p>
                {tool.paths.length > 0 ? (
                  <ul>
                    {tool.paths.map((path) => (
                      <li key={path}>{path}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
            {turn.text ? <p className="ask-text">{turn.text}</p> : null}
          </div>
        ))}
        {error ? <p className="ask-error">{error}</p> : null}
      </div>
      <form className="ask-form" onSubmit={(event) => void submit(event)}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={props.selected ? `Ask about ${props.selected}` : "Ask about this repository"}
          aria-label="Question"
          disabled={pending}
        />
        <button type="submit" disabled={pending || !draft.trim()}>
          {pending ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );

  function appendTool(name: string, input: string) {
    setTurns((current) => updateAssistant(current, (turn) => ({ ...turn, tools: [...turn.tools, { name, input, paths: [] }] })));
  }

  function attachPaths(name: string, returned: string[]) {
    setTurns((current) =>
      updateAssistant(current, (turn) => {
        const tools = [...turn.tools];
        const index = tools.findLastIndex((tool) => tool.name === name && tool.paths.length === 0);
        const tool = tools[index];
        if (!tool) return { ...turn, tools: [...tools, { name, input: "", paths: returned }] };
        tools[index] = { ...tool, paths: returned };
        return { ...turn, tools };
      }),
    );
  }

  function appendText(text: string) {
    setTurns((current) => updateAssistant(current, (turn) => ({ ...turn, text: turn.text + text })));
  }
}

function updateAssistant(turns: Turn[], update: (turn: Turn) => Turn): Turn[] {
  const next = [...turns];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const turn = next[index];
    if (turn?.role !== "assistant") continue;
    next[index] = update(turn);
    return next;
  }
  return turns;
}

async function readStream(body: ReadableStream<Uint8Array>, onEvent: (event: string, data: unknown) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice("event:".length).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trim());
      }
      if (dataLines.length === 0) continue;
      try {
        onEvent(event, JSON.parse(dataLines.join("\n")));
      } catch {
        // Ignore a malformed event and keep reading.
      }
    }
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body !== null && typeof body === "object") {
      const error = Reflect.get(body, "error");
      if (typeof error === "string") return error;
    }
  } catch {
    // The body was not JSON.
  }
  return "The agent isn't running. The map still works.";
}

function stringField(data: unknown, key: string): string | null {
  if (data === null || typeof data !== "object") return null;
  const value = Reflect.get(data, key);
  return typeof value === "string" ? value : null;
}

function stringArray(data: unknown, key: string): string[] {
  if (data === null || typeof data !== "object") return [];
  const value = Reflect.get(data, key);
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}
