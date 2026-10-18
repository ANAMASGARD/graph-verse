import { scoreAnswer } from "./agent-score.mts";

const cases = [
  {
    name: "facts with no lookup",
    input: { toolCalls: 0, answer: "Authentication is probably in src/auth.ts.", refusal: false },
    looked: 0,
    plumbing: 1,
  },
  {
    name: "facts after a lookup",
    input: { toolCalls: 1, answer: "Authentication is handled in src/auth.ts.", refusal: false },
    looked: 1,
    plumbing: 1,
  },
  {
    name: "names its own plumbing",
    input: { toolCalls: 1, answer: "I ran a Cypher query and found src/auth.ts.", refusal: false },
    looked: 1,
    plumbing: 0,
  },
  {
    name: "declines to review",
    input: {
      toolCalls: 0,
      answer: "I don't review code. I can answer where a file is, what it imports, and which routes exist.",
      refusal: true,
    },
    looked: 1,
    plumbing: 1,
  },
  {
    name: "grades the code",
    input: { toolCalls: 0, answer: "This code is good.", refusal: true },
    looked: 0,
    plumbing: 1,
  },
] as const;

let failed = 0;
for (const entry of cases) {
  const score = scoreAnswer(entry.input);
  const ok = score.looked === entry.looked && score.plumbing === entry.plumbing;
  if (!ok) failed += 1;
  console.log(
    `${ok ? "ok" : "miss"}  ${entry.name}  looked ${score.looked}  plumbing ${score.plumbing}`,
  );
}

console.log("A factual answer with no tool call is a hedge. A refusal is not, unless it grades the code or describes the machinery.");
if (failed > 0) process.exit(1);
