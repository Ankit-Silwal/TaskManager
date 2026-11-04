import { authRoutes } from "./src/routes/auth.routes.js";
import { taskRoutes } from "./src/routes/task.routes.js";
export function setUpRoutes(app) {
    app.use("/api/auth", authRoutes);
    app.use("/api/tasks", taskRoutes);
}
//# sourceMappingURL=routes.js.map