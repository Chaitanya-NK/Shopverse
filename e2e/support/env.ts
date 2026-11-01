/** Where the tests find the app's mail and database. Defaults match `supabase start`. */
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** The business the setup project creates (and reuses on later runs). */
export const OWNER = { name: "Esha Kapoor", email: "owner@e2e-threads.test" };
export const ORG = "e2e-threads";
export const SHOP = "e2e-threads";
export const SHOP_NAME = "E2E Threads";
export const app = (path = "") => `/app/${ORG}${path}`;
export const shop = (path = "") => `/s/${SHOP}${path}`;
