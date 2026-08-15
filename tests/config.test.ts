import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readConfig } from "@/lib/config";

function writeTempConfig(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "video-school-config-test-"));
  const file = path.join(dir, "config.yaml");
  fs.writeFileSync(file, contents);
  return file;
}

describe("readConfig", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("returns null defaults when the config file doesn't exist", () => {
    expect(readConfig("/nonexistent/path/config.yaml")).toEqual({ driveFolderUrl: null, videosDir: null });
  });

  it("parses driveFolderUrl and videosDir when present", () => {
    const file = writeTempConfig(`
driveFolderUrl: "https://drive.google.com/drive/folders/abc123"
videosDir: "/custom/videos"
`);
    tempDir = path.dirname(file);
    expect(readConfig(file)).toEqual({
      driveFolderUrl: "https://drive.google.com/drive/folders/abc123",
      videosDir: "/custom/videos",
    });
  });

  it("treats a blank or missing field as null", () => {
    const file = writeTempConfig(`driveFolderUrl: "   "`);
    tempDir = path.dirname(file);
    expect(readConfig(file)).toEqual({ driveFolderUrl: null, videosDir: null });
  });

  it("returns null defaults for a file with no recognized fields", () => {
    const file = writeTempConfig("{}\n");
    tempDir = path.dirname(file);
    expect(readConfig(file)).toEqual({ driveFolderUrl: null, videosDir: null });
  });
});
