import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const body: ApiErrorBody = { error: { code, message } };
  if (details !== undefined) {
    body.error.details = details;
  }
  res.status(status).json(body);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, "NOT_FOUND", message);
}

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // express.json() reports unparseable bodies as SyntaxError with type "entity.parse.failed".
  if (err instanceof SyntaxError && "type" in err && err.type === "entity.parse.failed") {
    sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON");
    return;
  }

  if (err instanceof ZodError) {
    sendError(res, 400, "VALIDATION_ERROR", "Request validation failed", err.flatten());
    return;
  }

  if (err instanceof HttpError) {
    sendError(res, err.status, err.code, err.message, err.details);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    sendError(res, 404, "NOT_FOUND", "Record not found");
    return;
  }

  sendError(res, 500, "INTERNAL", "An unexpected error occurred");
}
