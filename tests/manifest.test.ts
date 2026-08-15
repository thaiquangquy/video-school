import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readManifest } from "@/lib/manifest";

function writeTempManifest(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "video-school-manifest-test-"));
  const file = path.join(dir, "lessons.yaml");
  fs.writeFileSync(file, contents);
  return file;
}

describe("readManifest", () => {
  let tempFile: string | undefined;

  afterEach(() => {
    if (tempFile) fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
    tempFile = undefined;
  });

  it("parses a valid manifest, defaulting optional fields", () => {
    tempFile = writeTempManifest(`
- id: lesson-1
  title: Lesson One
  subject: Math
  order: 1
- id: lesson-2
  title: Lesson Two
  subject: Math
  order: 2
  tags: [algebra, intro]
  localPath: "2.mp4"
  driveUrl: "https://drive.google.com/file/d/abc123/view"
`);

    const lessons = readManifest(tempFile);
    expect(lessons).toHaveLength(2);
    expect(lessons[0]).toEqual({
      id: "lesson-1",
      title: "Lesson One",
      subject: "Math",
      tags: [],
      localPath: null,
      driveUrl: null,
      order: 1,
    });
    expect(lessons[1].tags).toEqual(["algebra", "intro"]);
    expect(lessons[1].localPath).toBe("2.mp4");
    expect(lessons[1].driveUrl).toBe("https://drive.google.com/file/d/abc123/view");
  });

  it("treats a blank localPath/driveUrl as null", () => {
    tempFile = writeTempManifest(`
- id: lesson-1
  title: Lesson One
  subject: Math
  order: 1
  localPath: "  "
  driveUrl: ""
`);
    const [lesson] = readManifest(tempFile);
    expect(lesson.localPath).toBeNull();
    expect(lesson.driveUrl).toBeNull();
  });

  it("throws when the manifest file doesn't exist", () => {
    expect(() => readManifest("/nonexistent/path/lessons.yaml")).toThrow(/not found/);
  });

  it("throws when the manifest isn't a YAML list", () => {
    tempFile = writeTempManifest(`driveFolderUrl: "not a list"`);
    expect(() => readManifest(tempFile)).toThrow(/must be a YAML list/);
  });

  it("throws on a missing required field", () => {
    tempFile = writeTempManifest(`
- id: lesson-1
  subject: Math
  order: 1
`);
    expect(() => readManifest(tempFile)).toThrow(/field "title"/);
  });

  it("throws when order is not a number", () => {
    tempFile = writeTempManifest(`
- id: lesson-1
  title: Lesson One
  subject: Math
  order: "one"
`);
    expect(() => readManifest(tempFile)).toThrow(/field "order" must be a number/);
  });

  it("throws on a duplicate lesson id", () => {
    tempFile = writeTempManifest(`
- id: lesson-1
  title: Lesson One
  subject: Math
  order: 1
- id: lesson-1
  title: Lesson One Again
  subject: Math
  order: 2
`);
    expect(() => readManifest(tempFile)).toThrow(/duplicate lesson id/);
  });
});
