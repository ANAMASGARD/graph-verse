const PLUMBING = /\b(cypher|falkordb|credential|bearer|hmac|ingress|analysis id)\b/i;
const GRADE = /\b(good|bad|well written|quality|score|rating|safe)\b/i;

export type AgentScore = {
  /** 1 when a factual answer looked something up. A refusal is not a miss. */
  looked: 0 | 1;
  /** 1 when the answer does not talk about its own plumbing. */
  plumbing: 0 | 1;
};

export function scoreAnswer(input: { toolCalls: number; answer: string; refusal: boolean }): AgentScore {
  const plumbing = PLUMBING.test(input.answer) ? 0 : 1;
  if (input.refusal) {
    const declined = /can answer|imports|routes|where a file/i.test(input.answer) && !GRADE.test(input.answer);
    return { looked: declined ? 1 : 0, plumbing };
  }
  return { looked: input.toolCalls > 0 ? 1 : 0, plumbing };
}
