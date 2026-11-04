import express from "express";
import cors from "cors";
import cookieparser from "cookie-parser";
import { setUpRoutes } from "./routes.js";
import os from "os";
const app = express();
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 0));
app.use((req, res, next) => {
    res.setHeader("X-Instance", os.hostname());
    next();
});
app.use(cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000",
    credentials: true,
    exposedHeaders: ["RateLimit-limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After"]
}));
app.use(express.json());
app.use(cookieparser());
setUpRoutes(app);
export default app;
//# sourceMappingURL=app.js.map