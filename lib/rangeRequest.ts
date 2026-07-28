export type RangeResult =
  | { type: "full"; start: number; end: number; status: 200 }
  | { type: "partial"; start: number; end: number; status: 206 }
  | { type: "invalid"; status: 416 };

/**
 * Parses an HTTP `Range` header (e.g. "bytes=0-1023", "bytes=1024-", or
 * "bytes=-500" for the last 500 bytes) against a known file size. Pure
 * function, no I/O, so it's cheap to unit test against a wide range of
 * inputs without touching the filesystem.
 */
export function parseRangeHeader(rangeHeader: string | null | undefined, fileSize: number): RangeResult {
  if (!rangeHeader) {
    return { type: "full", start: 0, end: fileSize - 1, status: 200 };
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return { type: "invalid", status: 416 };
  }

  const [, startStr, endStr] = match;
  if (startStr === "" && endStr === "") {
    return { type: "invalid", status: 416 };
  }

  let start: number;
  let end: number;

  if (startStr === "") {
    // Suffix range: last N bytes ("bytes=-500").
    const suffixLength = Number.parseInt(endStr, 10);
    if (suffixLength <= 0) return { type: "invalid", status: 416 };
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number.parseInt(startStr, 10);
    end = endStr === "" ? fileSize - 1 : Number.parseInt(endStr, 10);
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start > end ||
    start >= fileSize ||
    fileSize <= 0
  ) {
    return { type: "invalid", status: 416 };
  }

  end = Math.min(end, fileSize - 1);

  return { type: "partial", start, end, status: 206 };
}

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
};

export function mimeTypeForExtension(extension: string): string {
  return MIME_TYPES[extension.toLowerCase()] ?? "application/octet-stream";
}
