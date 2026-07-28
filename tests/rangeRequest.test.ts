import { describe, it, expect } from "vitest";
import { parseRangeHeader, mimeTypeForExtension } from "@/lib/rangeRequest";

const FILE_SIZE = 1000;

describe("parseRangeHeader", () => {
  it("returns a full 200 response when there's no Range header", () => {
    const result = parseRangeHeader(null, FILE_SIZE);
    expect(result).toEqual({ type: "full", start: 0, end: 999, status: 200 });
  });

  it("parses a standard bounded range", () => {
    const result = parseRangeHeader("bytes=0-499", FILE_SIZE);
    expect(result).toEqual({ type: "partial", start: 0, end: 499, status: 206 });
  });

  it("parses an open-ended range (from N to end of file)", () => {
    const result = parseRangeHeader("bytes=500-", FILE_SIZE);
    expect(result).toEqual({ type: "partial", start: 500, end: 999, status: 206 });
  });

  it("parses a suffix range (last N bytes)", () => {
    const result = parseRangeHeader("bytes=-500", FILE_SIZE);
    expect(result).toEqual({ type: "partial", start: 500, end: 999, status: 206 });
  });

  it("clamps an end beyond the file size down to the last byte", () => {
    const result = parseRangeHeader("bytes=900-5000", FILE_SIZE);
    expect(result).toEqual({ type: "partial", start: 900, end: 999, status: 206 });
  });

  it("scrubbing forward and backward across a file produces contiguous, non-overlapping-by-mistake ranges", () => {
    // Simulates a scrub: seek to 30%, then back to 10%, then forward to 70%.
    const seek1 = parseRangeHeader("bytes=300-", FILE_SIZE);
    const seek2 = parseRangeHeader("bytes=100-", FILE_SIZE);
    const seek3 = parseRangeHeader("bytes=700-", FILE_SIZE);

    expect(seek1).toMatchObject({ start: 300, end: 999 });
    expect(seek2).toMatchObject({ start: 100, end: 999 });
    expect(seek3).toMatchObject({ start: 700, end: 999 });
  });

  it("rejects a malformed Range header", () => {
    const result = parseRangeHeader("not-a-range", FILE_SIZE);
    expect(result).toEqual({ type: "invalid", status: 416 });
  });

  it("rejects a range where start > end", () => {
    const result = parseRangeHeader("bytes=500-100", FILE_SIZE);
    expect(result).toEqual({ type: "invalid", status: 416 });
  });

  it("rejects a range starting at or beyond the file size", () => {
    const result = parseRangeHeader("bytes=1000-1500", FILE_SIZE);
    expect(result).toEqual({ type: "invalid", status: 416 });
  });

  it("rejects a range against an empty/unknown file size", () => {
    const result = parseRangeHeader("bytes=0-10", 0);
    expect(result).toEqual({ type: "invalid", status: 416 });
  });
});

describe("mimeTypeForExtension", () => {
  it("maps common video extensions", () => {
    expect(mimeTypeForExtension(".mp4")).toBe("video/mp4");
    expect(mimeTypeForExtension(".MOV")).toBe("video/quicktime");
    expect(mimeTypeForExtension(".webm")).toBe("video/webm");
  });

  it("falls back to a generic binary type for unknown extensions", () => {
    expect(mimeTypeForExtension(".xyz")).toBe("application/octet-stream");
  });
});
