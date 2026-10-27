import { Router } from "express";
import { loginController, logoutController, refreshController, registerController } from "../controllers/auth.controller.js";

export const authRoutes=Router();

authRoutes.post("/register",registerController);
authRoutes.post("/login",loginController);
authRoutes.post("/refresh",refreshController);
authRoutes.post("/logout",logoutController);
