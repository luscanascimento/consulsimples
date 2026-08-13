import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AppError } from "./app-error";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const correlationId = String(req.headers["x-correlation-id"] ?? "");

    let status = 500;
    let code = "COMMON_500";
    let message = "Erro interno";
    let details: unknown;

    if (exception instanceof AppError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = status === 401 ? "AUTH_401" : status === 403 ? "AUTH_403" : `COMMON_${status}`;
      message = exception.message;
    }

    if (status >= 500) {
      this.logger.error({ err: exception, correlationId }, "unhandled exception");
    }

    res.status(status).json({ error: { code, message, details, correlationId } });
  }
}
