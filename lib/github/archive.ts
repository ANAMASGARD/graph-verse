import { execFile } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const USER_AGENT = "graph-verse";

// Public GitHub only. No Authorization header is set, and nothing from the
// response is stored except the commit sha the archive was built from.

export async function fetchCommitSha(owner: string, name: string): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${name}/commits/HEAD`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (response.status === 404) {
    throw new Error(`GitHub has no public repository ${owner}/${name}.`);
  }
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${owner}/${name}.`);
  }
  const body: unknown = await response.json();
  if (body === null || typeof body !== "object" || !("sha" in body) || typeof body.sha !== "string") {
    throw new Error(`GitHub did not return a commit for ${owner}/${name}.`);
  }
  return body.sha;
}

export async function downloadArchive(
  owner: string,
  name: string,
  sha: string,
  directory: string,
): Promise<string> {
  const response = await fetch(`https://codeload.github.com/${owner}/${name}/tar.gz/${sha}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (response.status === 404) {
    throw new Error(`GitHub has no archive for ${owner}/${name} at ${sha.slice(0, 7)}.`);
  }
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} while downloading ${owner}/${name}.`);
  }
  const archivePath = path.join(directory, "archive.tar.gz");
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  return archivePath;
}

/** The archive contains one top directory. That directory is the repository. */
export async function selectRepositoryRoot(archivePath: string, directory: string): Promise<string> {
  const dest = path.join(directory, "tree");
  await mkdir(dest, { recursive: true });
  try {
    await execFileAsync("tar", ["-xzf", archivePath, "-C", dest]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "tar failed";
    throw new Error(`Could not unpack the archive. ${detail}`);
  }
  const entries = await readdir(dest, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());
  const only = dirs[0];
  if (dirs.length !== 1 || only === undefined) {
    throw new Error(`Expected one repository directory in the archive, found ${dirs.length}.`);
  }
  return path.join(dest, only.name);
}
