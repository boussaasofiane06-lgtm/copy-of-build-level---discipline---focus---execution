import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerAdminAuthRoutes } from "./adminAuth";
import { registerAdminRestRoutes } from "./adminRest";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

const ALLOWED_ORIGINS = [
  "https://buildlevel.pages.dev",
  "https://build-level.pages.dev",
  "https://thebuildlevel.com",
  "https://www.thebuildlevel.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

const CONFIGURED_ORIGINS = [
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
].flatMap((value) => value?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? []);

// Allow any Manus preview subdomain dynamically
function isAllowedOrigin(origin: string): boolean {
  if (CONFIGURED_ORIGINS.includes(origin)) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Manus preview domains: https://<port>-<id>.us2.manus.computer
  if (/^https:\/\/\d+-[a-z0-9-]+\.us2\.manus\.computer$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.manus\.space$/.test(origin)) return true;
  return false;
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.get(["/health", "/api/health"], (_req, res) => {
    res.json({ status: "ok" });
  });

  // CORS — allow Cloudflare frontend domains
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin ${origin} not allowed`));
        }
      },
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "x-admin-token"],
    })
  );
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerAdminAuthRoutes(app);
  registerAdminRestRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  // When API_ONLY=true (Render backend), skip static file serving — frontend is on Cloudflare Pages
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else if (process.env.API_ONLY !== "true") {
    serveStatic(app);
  } else {
    // API-only mode: return 404 for non-API routes
    app.use("*", (_req, res) => {
      res.status(404).json({ error: "Not found", hint: "This is an API-only server. Frontend is hosted on Cloudflare Pages." });
    });
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = process.env.NODE_ENV === "development"
    ? await findAvailablePort(preferredPort)
    : preferredPort;

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);

    // Keep-alive: ping self every 10 minutes to prevent Render free tier from sleeping
    if (process.env.NODE_ENV !== "development") {
      const selfUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
      setInterval(async () => {
        try {
          await fetch(`${selfUrl}/health`);
          console.log(`[keep-alive] Pinged ${selfUrl}/health`);
        } catch (e) {
          console.log(`[keep-alive] Ping failed: ${e}`);
        }
      }, 10 * 60 * 1000); // every 10 minutes
    }
  });
}

startServer().catch(console.error);
