/**
 * Custom HTTPS server for Maya Villa Checklists (port 3004 in production).
 **/


import { createServer } from "node:https";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import next from "next";
import selfsigned from "selfsigned";

const PORT = parseInt(process.env.PORT ?? "3004", 10);
const CERTS_DIR = "./certs";
const CERT_FILE = `${CERTS_DIR}/cert.pem`;
const KEY_FILE = `${CERTS_DIR}/key.pem`;

function getLocalIPs() {
  const ips = ["127.0.0.1"];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

async function ensureCert() {
  if (existsSync(CERT_FILE) && existsSync(KEY_FILE)) {
    return { cert: readFileSync(CERT_FILE), key: readFileSync(KEY_FILE) };
  }

  console.log("Generating self-signed TLS certificate…");
  mkdirSync(CERTS_DIR, { recursive: true });

  const localIPs = getLocalIPs();
  const altNames = [
    { type: 2, value: "localhost" },
    ...localIPs.map((ip) => ({ type: 7, ip })),
  ];

  const pems = await selfsigned.generate(
    [{ name: "commonName", value: "mv-checklist.local" }],
    {
      keySize: 2048,
      days: 825,
      algorithm: "sha256",
      extensions: [{ name: "subjectAltName", altNames }],
    },
  );

  writeFileSync(CERT_FILE, pems.cert);
  writeFileSync(KEY_FILE, pems.private);

  return { cert: pems.cert, key: pems.private };
}

const app = next({ dev: false });
const handle = app.getRequestHandler();
await app.prepare();

const { cert, key } = await ensureCert();

createServer({ cert, key }, (req, res) => handle(req, res)).listen(
  PORT,
  "0.0.0.0",
  () => {
    const networkIPs = getLocalIPs().filter((ip) => ip !== "127.0.0.1");
    console.log(`\nMaya Villa Checklists — HTTPS`);
    console.log(`   Local:   https://localhost:${PORT}`);
    if (networkIPs.length > 0) {
      console.log(`   Network: https://${networkIPs[0]}:${PORT}`);
    }
    console.log("");
  },
);