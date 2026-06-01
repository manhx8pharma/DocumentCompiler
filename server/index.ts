import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool } from "../db";

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err.message);
  if (err.message?.includes('terminating connection') ||
      err.message?.includes('Connection terminated')) {
    console.log('[Process] DB connection drop - recoverable, not exiting');
    return;
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason);
  console.error('[Process] Unhandled rejection:', msg);
  if (msg?.includes('terminating connection') ||
      msg?.includes('Connection terminated')) {
    console.log('[Process] DB connection drop - recoverable, not exiting');
    return;
  }
  // For non-DB errors, log but don't crash (deployment environment is resilient)
});

console.log(`[Startup] Node environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`[Startup] Database URL configured: ${process.env.DATABASE_URL ? 'yes' : 'no'}`);

const app = express();
// Gzip compression for JSON/HTML responses (binary files like docx/zip are skipped automatically)
app.use(compression());
// Increased the body parser limits for handling larger JSON payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log('[Startup] Testing database connection...');
    try {
      await pool.query('SELECT 1');
      console.log('[Startup] Database connection successful');
    } catch (dbError) {
      console.error('[Startup] Database connection failed:', dbError);
      throw dbError;
    }

    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      console.error('Express error:', err);
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on port 5000
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = 5000;
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`serving on port ${port}`);
    });

    server.on('error', (err) => {
      console.error('Server error:', err);
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();
