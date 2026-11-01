import { execFileSync } from "node:child_process";

import { DATABASE_URL } from "./env";

/**
 * Run SQL as the database owner (setup and assertions only; the app itself is
 * always driven through the browser). Returns rows as `|`-separated text.
 */
export function sql(query: string, vars: Record<string, string> = {}): string {
  const args = [DATABASE_URL, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"];
  for (const [key, value] of Object.entries(vars)) args.push("-v", `${key}=${value}`);
  return execFileSync("psql", [...args, "-c", query], { encoding: "utf8" }).trim();
}

export function sqlFile(path: string, vars: Record<string, string> = {}): void {
  const args = [DATABASE_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1"];
  for (const [key, value] of Object.entries(vars)) args.push("-v", `${key}=${value}`);
  execFileSync("psql", [...args, "-f", path], { stdio: ["ignore", "ignore", "inherit"] });
}

/** Quote a value for SQL. */
export const lit = (value: string) => `'${value.replace(/'/g, "''")}'`;
