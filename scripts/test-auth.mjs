import Database from "better-sqlite3";
import path from "path";
import { createHash } from "crypto";

const dbPath = path.join(process.cwd(), "..", "MV Operating System", "mv-inventory", "data", "mv-inventory.db");
const db = new Database(dbPath);
const user = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
const hash = createHash("sha256").update("admin").digest("hex");
console.log("user found:", !!user);
console.log("password matches admin:", user?.password_hash === hash);
db.close();
