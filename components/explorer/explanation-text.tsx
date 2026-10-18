"use client";

import type { ReactNode } from "react";

type Block = { kind: "paragraph"; text: string } | { kind: "list"; items: string[] };

const BULLET = /^\s*(?:[-*•+]|\d+[.)])\s+/;
const HEADING = /^\s*#{1,6}\s+/;
const FENCE = /^\s*```/;

export function ExplanationText({
  text,
  isPath,
  onPath,
}: {
  text: string;
  isPath: (path: string) => boolean;
  onPath: (path: string) => ReactNode;
}) {
  const inline = (segment: string) => renderInline(segment, isPath, onPath);
  return (
    <div className="explanation-body">
      {blocks(text).map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={index}>{inline(block.text)}</p>
        ) : (
          <ul key={index} className="explanation-list">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{inline(item)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

function blocks(text: string): Block[] {
  const out: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (paragraph.length) out.push({ kind: "paragraph", text: paragraph.join(" ") });
    if (list) out.push({ kind: "list", items: list });
    paragraph = [];
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (FENCE.test(line)) continue;
    if (!line.trim()) {
      flush();
    } else if (HEADING.test(line)) {
      flush();
      const heading = line.replace(HEADING, "").replace(/\*\*/g, "").trim();
      out.push({ kind: "paragraph", text: `**${heading}**` });
    } else if (BULLET.test(line)) {
      if (paragraph.length) flush();
      (list ??= []).push(line.replace(BULLET, ""));
    } else if (list && /^\s{2,}/.test(raw)) {
      list[list.length - 1] += ` ${line.trim()}`;
    } else {
      if (list) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return out;
}

const TOKEN = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__/g;

function renderInline(
  text: string,
  isPath: (path: string) => boolean,
  onPath: (path: string) => ReactNode,
): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let counter = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index;
    if (at === undefined) continue;
    if (at > last) out.push(...plain(text.slice(last, at), isPath, onPath, counter++));
    const [, code, bold, boldAlt] = match;
    if (code !== undefined) {
      const inner = code.trim();
      out.push(
        isPath(inner) ? (
          <span key={`c${at}`}>{onPath(inner)}</span>
        ) : (
          <code key={`c${at}`} className="explanation-code">
            {inner}
          </code>
        ),
      );
    } else {
      out.push(
        <strong key={`b${at}`} className="explanation-strong">
          {renderInline(bold ?? boldAlt ?? "", isPath, onPath)}
        </strong>,
      );
    }
    last = at + match[0].length;
  }
  if (last < text.length) out.push(...plain(text.slice(last), isPath, onPath, counter++));
  return out;
}

function plain(
  text: string,
  isPath: (path: string) => boolean,
  onPath: (path: string) => ReactNode,
  counter: number,
): ReactNode[] {
  const cleaned = text
    .replace(/(^|[^\w*])\*(?=\S)([^*]+?)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^\w])_(?=\S)([^_]+?)_(?!\w)/g, "$1$2")
    .replace(/[`*]/g, "");
  return cleaned.split(/(\s+)/).map((word, index) => {
    const match = word.match(/^([("'[]*)(.*?)([)"'\].,;:!?]*)$/);
    const core = match?.[2] ?? word;
    if (core && core.length > 2 && isPath(core)) {
      return (
        <span key={`p${counter}-${index}`}>
          {match?.[1]}
          {onPath(core)}
          {match?.[3]}
        </span>
      );
    }
    return word;
  });
}
