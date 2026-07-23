import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { AppError } from "@/utils/errors";

type Target = "body" | "query" | "params";

export function validate(schema: ZodSchema, target: Target = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      return next(
        AppError.badRequest(
          "Some of the information you submitted isn't valid.",
          result.error.flatten().fieldErrors
        )
      );
    }
    (req as any)[target] = result.data;
    next();
  };
}
