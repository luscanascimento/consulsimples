import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // `set`, nunca `append`: sobrescreve o valor que o cliente possa ter mandado.
    const id = randomUUID();
    req.headers["x-correlation-id"] = id;
    res.setHeader("x-correlation-id", id);
    next();
  }
}
