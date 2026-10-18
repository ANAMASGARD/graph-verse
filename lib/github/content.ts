import "server-only";

const USER_AGENT = "graph-verse";
const API_TIMEOUT_MS = 15_000;

export type Repository = { owner: string; name: string };

export { fetchCommitSha as resolveHeadCommit } from "@/lib/github/archive";

export async function fetchFileAt(repository: Repository, sha: string, filePath: string): Promise<Buffer | null> {
  const what = `Fetching ${filePath} from ${repository.owner}/${repository.name} at ${sha.slice(0, 7)}`;
  const encoded = filePath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `https://raw.githubusercontent.com/${repository.owner}/${repository.name}/${sha}/${encoded}`,
    {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${what} failed: GitHub answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
