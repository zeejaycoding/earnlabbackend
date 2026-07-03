"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
// Socket.IO for real-time
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
/* morgan: require() to avoid TypeScript type errors when @types/morgan isn't installed.
   This keeps runtime behavior while allowing compilation even if the ambient types
   are missing. If you install `@types/morgan`, you can revert to:
     import morgan from "morgan";
*/
const morgan = require("morgan");
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load .env file if present (never override existing env vars)
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), ".env"), override: false });
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
}
else {
    console.log("MONGODB_URI env var is NOT SET — using localhost fallback");
}
const NODE_ENV = process.env.NODE_ENV || "development";
// --- MongoDB Connection Management for Serverless ---
let isConnecting = false;
let connectionPromise = null;
async function ensureMongoConnection() {
    if (mongoose_1.default.connection.readyState === 1) {
        return mongoose_1.default;
    }
    if (isConnecting && connectionPromise) {
        return connectionPromise;
    }
    isConnecting = true;
    connectionPromise = mongoose_1.default.connect(MONGODB_URI).then(() => {
        console.log("MongoDB connected");
        isConnecting = false;
        return mongoose_1.default;
    }).catch((err) => {
        console.error("MongoDB connection failed:", err);
        isConnecting = false;
        connectionPromise = null;
        throw err;
    });
    return connectionPromise;
}
// Start connection immediately for serverless
if (MONGODB_URI && mongoose_1.default.connection.readyState === 0) {
    ensureMongoConnection().catch(console.error);
}
const app = (0, express_1.default)();
// --- Middlewares ---
app.use((0, helmet_1.default)());
// CORS configuration - allow admin panel and frontend origins
const allowedOrigins = [
    'https://earnlabadmin.vercel.app',
    'https://earnlab.vercel.app',
    'https://earnlabfrontend.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
];
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || NODE_ENV === 'development') {
            callback(null, true);
        }
        else {
            console.log('CORS blocked origin:', origin);
            callback(null, true); // Allow all origins for now, can restrict later
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));
// Handle preflight requests
app.options('*', (0, cors_1.default)());
app.use(express_1.default.json({ limit: "1mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));
// --- Health check ---
app.get("/api/v1/health", (_req, res) => {
    res.json({
        status: "ok",
        env: NODE_ENV,
        db: mongoose_1.default.connection.readyState === 1 ? "connected" : "disconnected"
    });
});
// Root route for simple browser check
app.get("/", (_req, res) => {
    res.send("earnlab backned is succesfully running");
});
// --- Mount routers ---
//
// Wire the concrete routers implemented under `src/routes/*` into the app.
// Using static imports keeps TypeScript happy and makes failures visible at
// build time instead of swallowing them at runtime with try/catch stubs.
const auth_1 = __importDefault(require("./routes/auth"));
const user_1 = __importDefault(require("./routes/user"));
const offerwalls_1 = __importStar(require("./routes/offerwalls"));
const referrals_1 = __importDefault(require("./routes/referrals"));
const payouts_1 = __importDefault(require("./routes/payouts"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const feed_1 = __importDefault(require("./routes/feed"));
const content_1 = __importDefault(require("./routes/content"));
const tasks_1 = __importDefault(require("./routes/tasks"));
const rewards_1 = __importDefault(require("./routes/rewards"));
const leaderboard_1 = __importDefault(require("./routes/leaderboard"));
const giftbit_1 = __importDefault(require("./routes/giftbit"));
const admin_1 = __importDefault(require("./routes/admin"));
const chat_1 = __importDefault(require("./routes/chat"));
const tournaments_1 = __importDefault(require("./routes/tournaments"));
app.use("/api/v1/auth", auth_1.default);
app.use("/api/v1/user", user_1.default);
app.use("/api/v1/offerwalls", offerwalls_1.default);
app.use("/api/v1/games", offerwalls_1.gamesRouter);
// Mount newly added routers
// referrals: /api/v1/user/referrals/*
app.use("/api/v1/user/referrals", referrals_1.default);
// payouts and withdrawal routes (payouts exposes /payouts/options and /payouts/worldcoin/initiate,
// withdrawals are under /user/withdrawals/* so mount at /api/v1)
app.use("/api/v1", payouts_1.default);
// notifications: /api/v1/user/notifications/*
app.use("/api/v1/user/notifications", notifications_1.default);
// live feed: /api/v1/feed/*
app.use("/api/v1/feed", feed_1.default);
// tasks endpoints: /api/v1/tasks/*
app.use("/api/v1/tasks", tasks_1.default);
// rewards endpoints
app.use("/api/v1/rewards", rewards_1.default);
// leaderboard endpoints: /api/v1/leaderboard/*
app.use("/api/v1/leaderboard", leaderboard_1.default);
// content endpoints: /api/v1/content/*
app.use("/api/v1/content", content_1.default);
// chat endpoints: /api/v1/chat/*
app.use("/api/v1/chat", chat_1.default);
// tournament endpoints: /api/v1/tournaments/*
app.use("/api/v1/tournaments", tournaments_1.default);
// Giftbit gift card endpoints: /api/v1/giftbit/*
app.use("/api/v1", giftbit_1.default);
// Admin panel endpoints: /api/admin/*
// Ensure DB connection before admin routes
app.use("/api/admin", async (req, res, next) => {
    try {
        await ensureMongoConnection();
        next();
    }
    catch (error) {
        console.error("MongoDB connection error for admin route:", error);
        res.status(503).json({ error: "Database unavailable" });
    }
});
app.use("/api/admin", admin_1.default);
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
}
catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Support routes not mounted (module not found)");
}
// --- 404 handler ---
app.use((_req, res) => {
    res.status(404).json({ message: "Not Found" });
});
// --- Error handler ---
app.use((err, _req, res, _next) => {
    // Simple error handler: in production hide stack, in dev show it
    const status = err.status || 500;
    const body = { message: err.message || "Internal Server Error" };
    if (NODE_ENV !== "production") {
        body.stack = err.stack;
    }
    // eslint-disable-next-line no-console
    console.error("Unhandled error:", err);
    res.status(status).json(body);
});
// --- Server and Mongo connection management ---
let server = null;
async function start() {
    // Ensure MongoDB connection
    await ensureMongoConnection();
    app.locals.dbConnected = true;
    try {
        server = http_1.default.createServer(app);
        // attach Socket.IO for realtime features
        const io = new socket_io_1.Server(server, {
            cors: {
                origin: process.env.FRONTEND_ORIGIN || "*",
                methods: ["GET", "POST", "PUT", "DELETE"],
            },
        });
        // store on app.locals so routers can emit
        app.locals.io = io;
        io.on("connection", (socket) => {
            // simple identify: client may emit 'identify' with its JWT token
            socket.on("identify", (token) => {
                try {
                    const jwt = require("jsonwebtoken");
                    const secret = process.env.JWT_SECRET || "please-change-this-secret";
                    const payload = jwt.verify(token, secret);
                    const userId = payload.sub;
                    if (userId) {
                        const room = `user:${userId}`;
                        socket.join(room);
                        socket.data.userId = userId;
                        // eslint-disable-next-line no-console
                        console.log(`Socket ${socket.id} identified as ${userId}`);
                    }
                }
                catch (e) {
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
        server.on("error", (err) => {
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
            console.log(`Server listening on http://localhost:${PORT} (env=${NODE_ENV}) (dbConnected=${Boolean(app.locals.dbConnected)})`);
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
    }
    catch (err) {
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
            if (server.listening) {
                await new Promise((resolve, reject) => {
                    server.close((err) => (err ? reject(err) : resolve()));
                });
            }
            else {
                // server exists but isn't listening — nothing to close
                // eslint-disable-next-line no-console
                console.log("Server existed but was not listening; skipping close()");
            }
        }
        await mongoose_1.default.disconnect();
        // eslint-disable-next-line no-console
        console.log("Shutdown complete.");
        process.exit(0);
    }
    catch (err) {
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
exports.default = app;
//# sourceMappingURL=index.js.map