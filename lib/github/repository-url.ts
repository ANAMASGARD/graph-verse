// A public GitHub repository URL. Anything else is refused here, before a
// run exists, so a bad paste never becomes an analysis.

const REPO_NAME = /^[A-Za-z0-9_.-]+$/;

export type PublicRepo = {
  owner: string;
  name: string;
};

export function parseGithubRepoUrl(input: string): PublicRepo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;

  const parts = url.pathname.split("/").filter((part) => part.length > 0);
  if (parts.length !== 2) return null;

  const owner = parts[0];
  const rawName = parts[1];
  if (owner === undefined || rawName === undefined) return null;
  const name = rawName.replace(/\.git$/, "");
  if (!REPO_NAME.test(owner) || !REPO_NAME.test(name)) return null;
  if (owner === "." || owner === ".." || name === "." || name === "..") return null;
  return { owner, name };
}
