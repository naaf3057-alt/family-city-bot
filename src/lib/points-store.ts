import { readFileSync, writeFileSync, existsSync } from "fs";
import { logger } from "./logger";

const POINTS_FILE = "/tmp/ticket-points.json";

function load(): Record<string, number> {
  if (!existsSync(POINTS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(POINTS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function save(data: Record<string, number>) {
  try {
    writeFileSync(POINTS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    logger.warn({ err }, "Failed to save points");
  }
}

export function addPoints(userId: string, amount: number): number {
  const data = load();
  data[userId] = (data[userId] ?? 0) + amount;
  save(data);
  return data[userId]!;
}

export function getPoints(userId: string): number {
  const data = load();
  return data[userId] ?? 0;
}
