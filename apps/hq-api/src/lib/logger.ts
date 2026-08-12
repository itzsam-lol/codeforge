import pino from "pino";
import { config } from "../config";

export const logger = pino({
  level: config.isProd ? "info" : "debug",
  transport: config.isProd
    ? undefined
    : { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } },
});
