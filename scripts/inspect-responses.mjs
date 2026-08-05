import Database from "better-sqlite3";
import path from "path";

const db = new Database(
  path.join(process.cwd(), "..", "MV Operating System", "mv-inventory", "data", "mv-inventory.db"),
);
console.log("responses schema:", db.prepare("PRAGMA table_info(checklist_item_responses)").all());
const s = db.prepare("SELECT id, checklist_type_slug FROM checklist_sessions WHERE id IS NOT NULL LIMIT 1").get();
console.log("sample session:", s);
if (s) {
  console.log(
    "responses for session:",
    db.prepare("SELECT id, session_id, template_item_id, status FROM checklist_item_responses WHERE session_id = ? LIMIT 3").all(s.id),
  );
}
db.close();
