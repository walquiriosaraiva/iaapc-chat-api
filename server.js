import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/chat.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envFilePaths = [
  path.join(__dirname, ".env.local"),
  path.join(__dirname, ".env")
];
const port = Number(process.env.PORT || 3001);

await loadEnvFiles();

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (pathname === "/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (pathname !== "/api/chat") {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Rota não encontrada" }));
      return;
    }

    req.body = await parseJsonBody(req);
    res.status = (statusCode) => {
      res.statusCode = statusCode;
      return res;
    };
    res.json = (payload) => {
      if (!res.getHeader("Content-Type")) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }

      res.end(JSON.stringify(payload));
      return res;
    };

    await handler(req, res);
  } catch (error) {
    console.error("Erro no servidor local:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify({ error: "Erro interno no servidor local." }));
  }
});

server.listen(port, () => {
  console.log(`Chat API local em http://localhost:${port}`);
});

async function loadEnvFiles() {
  for (const envFilePath of envFilePaths) {
    try {
      const envContent = await readFile(envFilePath, "utf8");

      envContent
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .forEach((line) => {
          const separatorIndex = line.indexOf("=");

          if (separatorIndex === -1) {
            return;
          }

          const key = line.slice(0, separatorIndex).trim();
          const rawValue = line.slice(separatorIndex + 1).trim();

          if (!key || process.env[key] !== undefined) {
            return;
          }

          process.env[key] = rawValue.replace(/^['\"]|['\"]$/g, "");
        });
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

async function parseJsonBody(req) {
  if (["GET", "HEAD"].includes(req.method || "")) {
    return {};
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(rawBody);
}