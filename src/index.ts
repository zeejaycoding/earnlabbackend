/**
 * src/index.ts
 *
 * Simple Express app entrypoint in TypeScript.
 *
 * Responsibilities:
 * - Load environment
 * - Connect to MongoDB via mongoose
 * - Configure middlewares (JSON parsing, CORS, security headers)
 * - Mount API route placeholders
 * - Start HTTP server and handle graceful shutdown
 *
 * Note: Route modules (./routes/*.ts) are expected to exist and export an Express router.
 * If they are not yet implemented, the app will still start but those mounts may be no-ops
 * depending on how you implement the route files.
 */

import express, { Request, Response, NextFunction } from "express";
import http from "http";
// Socket.IO for real-time
import { Server as IOServer } from "socket.io";
import cors from "cors";
import helmet from "helmet";
/* morgan: require() to avoid TypeScript type errors when @types/morgan isn't installed.
   This keeps runtime behavior while allowing compilation even if the ambient types
   are missing. If you install `@types/morgan`, you can revert to:
     import morgan from "morgan";
*/
const morgan = require("morgan");
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

// Load .env file if present (never override existing env vars)
dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: false });

// Log which env vars are present (keys only, for debugging Render deployment)
const presentKeys = Object.keys(process.env).filter(k => k.startsWith("MONGODB") || k.startsWith("CLERK") || k.startsWith("JWT") || k.startsWith("SMTP"));
console.log("Relevant env vars present:", presentKeys.join(", "));

const PORT = Number(process.env.PORT || 5000);
const rawUri = process.env.MONGODB_URI || "";
const MONGODB_URI = rawUri || "mongodb://localhost:27017/earnlab";
if (rawUri) {
  // Log first 30 chars of URI to verify the value (masking credentials)
  const masked = rawUri.length > 10 ? rawUri.substring(0, 10) + "..." + rawUri.substring(rawUri.length - 10) : rawUri;
  console.log("MONGODB_URI value (masked):", JSON.stringify(masked), "length:", rawUri.length);
} else {
  console.log("MONGODB_URI env var is NOT SET — using localhost fallback");
}
const NODE_ENV = process.env.NODE_ENV || "development";

// --- MongoDB Connection Management for Serverless ---
let isConnecting = false;
let connectionPromise: Promise<typeof mongoose> | null = null;

async function ensureMongoConnection() {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }
  
  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }
  
  isConnecting = true;
  connectionPromise = mongoose.connect(MONGODB_URI).then(() => {
    console.log("MongoDB connected");
    isConnecting = false;
    return mongoose;
  }).catch((err) => {
    console.error("MongoDB connection failed:", err);
    isConnecting = false;
    connectionPromise = null;
    throw err;
  });
  
  return connectionPromise;
}

// Start connection immediately for serverless
if (MONGODB_URI && mongoose.connection.readyState === 0) {
  ensureMongoConnection().catch(console.error);
}

const app = express();

// --- Middlewares ---
app.use(helmet());

// CORS configuration - allow admin panel and frontend origins
const allowedOrigins = [
  'https://earnlabadmin.vercel.app',
  'https://earnlab.vercel.app',
  'https://earnlabfrontend.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true); // Allow all origins for now, can restrict later
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

// --- Health check ---
app.get("/api/v1/health", (_req: Request, res: Response) => {
  res.json({ 
    status: "ok", 
    env: NODE_ENV,
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

// Root route for simple browser check
app.get("/", (_req: Request, res: Response) => {
  res.send("earnlab backned is succesfully running");
});

// --- Mount routers ---
//
// Wire the concrete routers implemented under `src/routes/*` into the app.
// Using static imports keeps TypeScript happy and makes failures visible at
// build time instead of swallowing them at runtime with try/catch stubs.
import authRouter from "./routes/auth";
import userRouter from "./routes/user";
import offerwallsRouter, { gamesRouter } from "./routes/offerwalls";
import referralsRouter from "./routes/referrals";
import payoutsRouter from "./routes/payouts";
import notificationsRouter from "./routes/notifications";
import feedRouter from "./routes/feed";
import contentRouter from "./routes/content";
import tasksRouter from "./routes/tasks";
import rewardsRouter from "./routes/rewards";
import leaderboardRouter from "./routes/leaderboard";
import giftbitRouter from "./routes/giftbit";
import adminRouter from "./routes/admin";
import chatRouter from "./routes/chat";
import tournamentsRouter from "./routes/tournaments";

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/offerwalls", offerwallsRouter);
app.use("/api/v1/games", gamesRouter);
// Mount newly added routers
// referrals: /api/v1/user/referrals/*
app.use("/api/v1/user/referrals", referralsRouter);
// payouts and withdrawal routes (payouts exposes /payouts/options and /payouts/worldcoin/initiate,
// withdrawals are under /user/withdrawals/* so mount at /api/v1)
app.use("/api/v1", payoutsRouter);
// notifications: /api/v1/user/notifications/*
app.use("/api/v1/user/notifications", notificationsRouter);
// live feed: /api/v1/feed/*
app.use("/api/v1/feed", feedRouter);

// tasks endpoints: /api/v1/tasks/*
app.use("/api/v1/tasks", tasksRouter);

// rewards endpoints
app.use("/api/v1/rewards", rewardsRouter);

// leaderboard endpoints: /api/v1/leaderboard/*
app.use("/api/v1/leaderboard", leaderboardRouter);

// content endpoints: /api/v1/content/*
app.use("/api/v1/content", contentRouter);

// chat endpoints: /api/v1/chat/*
app.use("/api/v1/chat", chatRouter);

// tournament endpoints: /api/v1/tournaments/*
app.use("/api/v1/tournaments", tournamentsRouter);

// Giftbit gift card endpoints: /api/v1/giftbit/*
app.use("/api/v1", giftbitRouter);

// Admin panel endpoints: /api/admin/*
// Ensure DB connection before admin routes
app.use("/api/admin", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureMongoConnection();
    next();
  } catch (error) {
    console.error("MongoDB connection error for admin route:", error);
    res.status(503).json({ error: "Database unavailable" });
  }
});
app.use("/api/admin", adminRouter);

// support endpoints (optional): /api/v1/support/*
// Attempt to require the support router at runtime so the app can start even if
// the support routes are not present during development or in some environments.
try {
  // use require to avoid a hard import failure if file is absent
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const supportRouter = require("./routes/support").default;
  if (supportRouter) {
    app.use("/api/v1/support", supportRouter);
  }
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn("Support routes not mounted (module not found)");
}

// --- 404 handler ---
app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: "Not Found" });
});

// --- Error handler ---
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Simple error handler: in production hide stack, in dev show it
  const status = err.status || 500;
  const body: any = { message: err.message || "Internal Server Error" };
  if (NODE_ENV !== "production") {
    body.stack = err.stack;
  }
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  res.status(status).json(body);
});

// --- Server and Mongo connection management ---
let server: http.Server | null = null;

async function start() {
  // Ensure MongoDB connection
  await ensureMongoConnection();
  (app as any).locals.dbConnected = true;

    try {
      server = http.createServer(app);

      // attach Socket.IO for realtime features
      const io = new IOServer(server, {
        cors: {
          origin: process.env.FRONTEND_ORIGIN || "*",
          methods: ["GET", "POST", "PUT", "DELETE"],
        },
      });

      // store on app.locals so routers can emit
      (app as any).locals.io = io;

      io.on("connection", (socket) => {
        // simple identify: client may emit 'identify' with its JWT token
        socket.on("identify", (token: string) => {
          try {
            const jwt = require("jsonwebtoken");
            const secret = process.env.JWT_SECRET || "please-change-this-secret";
            const payload: any = jwt.verify(token, secret);
            const userId = payload.sub;
            if (userId) {
              const room = `user:${userId}`;
              socket.join(room);
              socket.data.userId = userId;
              // eslint-disable-next-line no-console
              console.log(`Socket ${socket.id} identified as ${userId}`);
            }
          } catch (e) {
            // ignore invalid token
          }
        });

        socket.on("disconnect", () => {
          // eslint-disable-next-line no-console
          console.log(`Socket ${socket.id} disconnected`);
        });
      });

      // handle listen errors (e.g. port already in use) explicitly so we don't
      // rely on uncaughtException and get a hard-to-handle shutdown.
      server.on("error", (err: any) => {
        if (err && (err.code === "EADDRINUSE" || err.code === "EACCES")) {
          // eslint-disable-next-line no-console
          console.error(`Port ${PORT} is not available (${err.code}).`);
          // Exit with non-zero so process managers know startup failed.
          process.exit(1);
        }
        // For other errors rethrow so they can be handled by the outer try/catch
        // and error middleware.
        // eslint-disable-next-line no-console
        console.error("Server error", err);
      });

      server.listen(PORT, () => {
        // eslint-disable-next-line no-console
        console.log(
          `Server listening on http://localhost:${PORT} (env=${NODE_ENV}) (dbConnected=${Boolean((app as any).locals.dbConnected)})`,
        );
      });

    // graceful shutdown handlers
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    process.on("uncaughtException", (err) => {
      // eslint-disable-next-line no-console
      console.error("uncaughtException", err);
      // attempt graceful shutdown
      shutdown();
    });
    process.on("unhandledRejection", (reason) => {
      // eslint-disable-next-line no-console
      console.error("unhandledRejection", reason);
    });
  } catch (err) {
    // If server fails to start this is fatal
    // eslint-disable-next-line no-console
    console.error("Failed to start application", err);
    process.exit(1);
  }
}

async function shutdown() {
  // eslint-disable-next-line no-console
  console.log("Shutting down server...");
  try {
    if (server) {
      // Only attempt to close the server if it's in a listening state.
      // Calling close() on a non-running server can raise ERR_SERVER_NOT_RUNNING.
      // Use a runtime check to avoid that.
      if ((server as any).listening) {
        await new Promise<void>((resolve, reject) => {
          server!.close((err) => (err ? reject(err) : resolve()));
        });
      } else {
        // server exists but isn't listening — nothing to close
        // eslint-disable-next-line no-console
        console.log("Server existed but was not listening; skipping close()");
      }
    }
    await mongoose.disconnect();
    // eslint-disable-next-line no-console
    console.log("Shutdown complete.");
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error during shutdown", err);
    process.exit(1);
  }
}

// Only start if this file is executed directly (and not imported in tests)
if (require.main === module) {
  start();
}

// Export app for testing purposes
export default app;
