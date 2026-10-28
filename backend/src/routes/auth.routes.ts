import { Router } from "express";
import { loginController, logoutController, refreshController, registerController } from "../controllers/auth.controller.js";
import { loginRateLimiter, refreshLimiter, registerLimiter } from "../config/rateLimit.js";

export const authRoutes=Router();

authRoutes.post("/register",registerLimiter,registerController);
authRoutes.post("/login",loginRateLimiter,loginController);
authRoutes.post("/refresh",refreshLimiter,refreshController);
authRoutes.post("/logout",logoutController);
