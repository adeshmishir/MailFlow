import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./errorHandler";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return next(new HttpError(401, "You must be logged in to access this resource"));
  }
  next();
}
