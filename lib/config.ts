import fs from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";

export const CONFIG_PATH = path.join(process.cwd(), "data", "config.yaml");

export type AppConfig = {
  driveFolderUrl: string | null;
  videosDir: string | null;
};

/**
 * Reads app-level config. Unlike the lesson manifest, this file is optional
 * — a missing file (or a missing/blank field) just means the convenience
 * features it powers (e.g. a "browse the Drive folder" link, or an
 * alternate local video directory) are switched off/defaulted, not an error.
 */
export function readConfig(configPath: string = CONFIG_PATH): AppConfig {
  if (!fs.existsSync(configPath)) {
    return { driveFolderUrl: null, videosDir: null };
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = loadYaml(raw) as { driveFolderUrl?: unknown; videosDir?: unknown } | null;

  const driveFolderUrl =
    parsed && typeof parsed.driveFolderUrl === "string" && parsed.driveFolderUrl.trim() !== ""
      ? parsed.driveFolderUrl
      : null;

  const videosDir =
    parsed && typeof parsed.videosDir === "string" && parsed.videosDir.trim() !== "" ? parsed.videosDir : null;

  return { driveFolderUrl, videosDir };
}
