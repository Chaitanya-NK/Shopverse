/* eslint-disable no-console -- command-line script */
// Copy every file in the product-images bucket (product photos, logos,
// banners, design images) to a local folder.
//
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/backup/backup-storage.mjs [out-dir]
//
// Re-running only downloads files that aren't there yet.
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const BUCKET = "product-images";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");
  process.exit(1);
}
const out = process.argv[2] ?? `backups/storage-${BUCKET}`;
const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET);

async function* walk(prefix) {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await storage.list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders have no id.
      if (entry.id === null) yield* walk(path);
      else yield path;
    }
    if (data.length < 1000) return;
  }
}

let copied = 0;
let skipped = 0;
for await (const path of walk("")) {
  const target = join(out, path);
  if (existsSync(target)) {
    skipped++;
    continue;
  }
  const { data, error } = await storage.download(path);
  if (error) throw error;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, Buffer.from(await data.arrayBuffer()));
  copied++;
}
console.log(`Storage backup in ${out}: ${copied} copied, ${skipped} already there.`);
