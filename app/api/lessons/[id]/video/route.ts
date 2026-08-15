import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getLessonById } from "@/lib/lessons";
import { resolveLocalPath } from "@/lib/watcher";
import { parseRangeHeader, mimeTypeForExtension } from "@/lib/rangeRequest";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = await getLessonById(id);

  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  if (!lesson.localPath) {
    if (lesson.driveUrl) {
      return NextResponse.json({ source: "drive", driveUrl: lesson.driveUrl });
    }
    return NextResponse.json({ error: "No video source configured for this lesson" }, { status: 404 });
  }

  const absolutePath = resolveLocalPath(lesson.localPath);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    return NextResponse.json({ error: "Video file not found on disk" }, { status: 404 });
  }

  const rangeHeader = request.headers.get("range");
  const range = parseRangeHeader(rangeHeader, stat.size);
  const contentType = mimeTypeForExtension(path.extname(absolutePath));

  if (range.type === "invalid") {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${stat.size}`,
      },
    });
  }

  const nodeStream = fs.createReadStream(absolutePath, { start: range.start, end: range.end });
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Length": String(range.end - range.start + 1),
  };

  if (range.type === "partial") {
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${stat.size}`;
  }

  return new NextResponse(webStream, { status: range.status, headers });
}
