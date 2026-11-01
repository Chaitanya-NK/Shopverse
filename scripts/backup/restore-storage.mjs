/* eslint-disable no-console -- command-line script */
// Upload a folder made by backup-storage.mjs back into the product-images
// bucket (files that already exist are left alone).
//
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/backup/restore-storage.mjs <dir>
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const BUCKET = "product-images";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const dir = process.argv[2];
if (!url || !key || !dir) {
  console.error(
    "Usage: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… node restore-storage.mjs <dir>",
  );
  process.exit(1);
}
const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET);
const files = (function list(d) {
  return readdirSync(d).flatMap((name) => {
    const p = join(d, name);
    return statSync(p).isDirectory() ? list(p) : [p];
  });
})(dir);

let uploaded = 0;
let existing = 0;
for (const file of files) {
  const path = relative(dir, file).split("\\").join("/");
  const { error } = await storage.upload(path, readFileSync(file), {
    contentType: path.endsWith(".webp") ? "image/webp" : undefined,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error && /exists/i.test(error.message)) existing++;
  else if (error) throw new Error(`${path}: ${error.message}`);
  else uploaded++;
}
console.log(`Restored ${uploaded} files (${existing} were already there).`);
