import Database from "better-sqlite3";
import path from "path";
import { existsSync } from "fs";

const candidates = [
  path.join(process.cwd(), "..", "MV Operating System", "mv-inventory", "data", "mv-inventory.db"),
  path.join(process.cwd(), "data", "mv-checklist.db"),
];

for (const p of candidates) {
  if (!existsSync(p)) continue;
  const db = new Database(p);
  console.log("\nDB:", p);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log("tables:", tables.map((t) => t.name).join(", "));
  try {
    console.log("users:", db.prepare("PRAGMA table_info(users)").all());
  } catch (e) {
    console.log("no users table");
  }
  try {
    console.log("checklist_types count:", db.prepare("SELECT COUNT(*) as c FROM checklist_types").get());
  } catch (e) {
    console.log("no checklist_types");
  }
  db.close();
}
