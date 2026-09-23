import { Router } from "express";

import { authenticate } from "@/middleware/auth";
import { validate } from "@/middleware/validate";

import { hrCopilotMessageSchema } from "./hr-copilot.schema";
import { askHrCopilot } from "./hr-copilot.service";

export const hrCopilotRouter = Router();

hrCopilotRouter.use(authenticate);

hrCopilotRouter.post(
  "/chat",
  validate(hrCopilotMessageSchema),
  async (req, res, next) => {
    try {
      const result = await askHrCopilot(
        req,
        req.body,
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);