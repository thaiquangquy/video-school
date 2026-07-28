import fs from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";

export const MANIFEST_PATH = path.join(process.cwd(), "data", "lessons.yaml");

export type ManifestLesson = {
  id: string;
  title: string;
  subject: string;
  tags: string[];
  localPath: string | null;
  driveUrl: string | null;
  order: number;
};

type RawManifestLesson = {
  id: unknown;
  title: unknown;
  subject: unknown;
  tags?: unknown;
  localPath?: unknown;
  driveUrl?: unknown;
  order: unknown;
};

function assertString(value: unknown, field: string, id: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Manifest lesson "${id}": field "${field}" must be a non-empty string`);
  }
  return value;
}

function normalizeLesson(raw: RawManifestLesson): ManifestLesson {
  const id = assertString(raw.id, "id", String(raw.id ?? "<unknown>"));
  const title = assertString(raw.title, "title", id);
  const subject = assertString(raw.subject, "subject", id);

  if (typeof raw.order !== "number") {
    throw new Error(`Manifest lesson "${id}": field "order" must be a number`);
  }

  const tags = Array.isArray(raw.tags) ? raw.tags.map((t) => String(t)) : [];
  const localPath = typeof raw.localPath === "string" && raw.localPath.trim() !== "" ? raw.localPath : null;
  const driveUrl = typeof raw.driveUrl === "string" && raw.driveUrl.trim() !== "" ? raw.driveUrl : null;

  return { id, title, subject, tags, localPath, driveUrl, order: raw.order };
}

export function readManifest(manifestPath: string = MANIFEST_PATH): ManifestLesson[] {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Lesson manifest not found at ${manifestPath}`);
  }

  const raw = fs.readFileSync(manifestPath, "utf-8");
  const parsed = loadYaml(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`Lesson manifest at ${manifestPath} must be a YAML list of lessons`);
  }

  const lessons = (parsed as RawManifestLesson[]).map(normalizeLesson);

  const seenIds = new Set<string>();
  for (const lesson of lessons) {
    if (seenIds.has(lesson.id)) {
      throw new Error(`Manifest has duplicate lesson id "${lesson.id}"`);
    }
    seenIds.add(lesson.id);
  }

  return lessons;
}
