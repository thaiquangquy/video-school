"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LessonWithProgress, WatchSource, WatchStatus } from "@/lib/lessons";

const HEARTBEAT_INTERVAL_MS = 5000;
const RESUME_THRESHOLD_SECONDS = 3;

/** Extracts a Drive file id from a full share link, an open?id= link, or a bare id. */
function extractDriveFileId(driveUrl: string): string {
  const filePathMatch = driveUrl.match(/\/file\/d\/([^/]+)/);
  if (filePathMatch) return filePathMatch[1];

  const idParamMatch = driveUrl.match(/[?&]id=([^&]+)/);
  if (idParamMatch) return idParamMatch[1];

  return driveUrl.trim();
}

function statusLabel(status: WatchStatus): string {
  if (status === "completed") return "Completed";
  if (status === "in_progress") return "In progress";
  return "Not started";
}

function badgeClass(status: WatchStatus): string {
  if (status === "completed") return "badge badge-completed";
  if (status === "in_progress") return "badge badge-in-progress";
  return "badge";
}

type Props = {
  lesson: LessonWithProgress;
  driveFolderUrl?: string | null;
};

export function VideoPlayer({ lesson, driveFolderUrl }: Props) {
  const [progress, setProgress] = useState(lesson.progress);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSentAtRef = useRef(0);
  const hasResumedRef = useRef(false);
  const initialPositionRef = useRef(lesson.progress.positionSeconds);

  const sendProgress = useCallback(
    (positionSeconds: number, durationSeconds: number | null, source: WatchSource, useBeacon = false) => {
      const body = JSON.stringify({ positionSeconds, durationSeconds, source });
      const url = `/api/lessons/${lesson.id}/progress`;

      if (useBeacon && "sendBeacon" in navigator) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
        return;
      }

      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      })
        .then((res) => res.json())
        .then((data: { lesson?: LessonWithProgress }) => {
          if (data.lesson) setProgress(data.lesson.progress);
        })
        .catch((err) => console.error(`[DEBUG] VideoPlayer.sendProgress lesson=${lesson.id}:`, err));
    },
    [lesson.id],
  );

  useEffect(() => {
    if (!lesson.localPath) return;
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      if (!hasResumedRef.current && initialPositionRef.current > RESUME_THRESHOLD_SECONDS) {
        video.currentTime = initialPositionRef.current;
        console.log(`[DEBUG] VideoPlayer resuming lesson=${lesson.id} at ${initialPositionRef.current}s`);
      }
      hasResumedRef.current = true;
    };

    const handleTimeUpdate = () => {
      const now = Date.now();
      if (now - lastSentAtRef.current < HEARTBEAT_INTERVAL_MS) return;
      lastSentAtRef.current = now;
      sendProgress(video.currentTime, video.duration || null, "local");
    };

    const handlePause = () => {
      sendProgress(video.currentTime, video.duration || null, "local");
    };

    const handleBeforeUnload = () => {
      sendProgress(video.currentTime, video.duration || null, "local", true);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("pause", handlePause);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("pause", handlePause);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (video.currentTime > 0) {
        sendProgress(video.currentTime, video.duration || null, "local", true);
      }
    };
  }, [lesson.localPath, lesson.id, sendProgress]);

  const handleMarkStatus = (status: WatchStatus) => {
    fetch(`/api/lessons/${lesson.id}/mark-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
      .then((res) => res.json())
      .then((data: { lesson?: LessonWithProgress }) => {
        if (data.lesson) setProgress(data.lesson.progress);
      })
      .catch((err) => console.error(`[DEBUG] VideoPlayer.markStatus lesson=${lesson.id}:`, err));
  };

  const percent =
    progress.durationSeconds && progress.durationSeconds > 0
      ? Math.min(100, Math.round((progress.positionSeconds / progress.durationSeconds) * 100))
      : null;

  return (
    <div>
      {lesson.localPath ? (
        <video
          ref={videoRef}
          src={`/api/lessons/${lesson.id}/video`}
          controls
          style={{ width: "100%", borderRadius: "var(--radius)", background: "#000", display: "block" }}
        />
      ) : lesson.driveUrl ? (
        <div>
          <iframe
            title={lesson.title}
            src={`https://drive.google.com/file/d/${extractDriveFileId(lesson.driveUrl)}/preview`}
            allow="autoplay"
            style={{ width: "100%", aspectRatio: "16 / 9", border: "none", borderRadius: "var(--radius)" }}
          />
          <div className="card" style={{ marginTop: 12 }}>
            <p className="muted" style={{ marginBottom: 10, fontSize: "0.85rem" }}>
              This lesson plays from Google Drive — there&apos;s no way to detect playback progress automatically.
              Update it manually as you go:
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-secondary" onClick={() => handleMarkStatus("not_started")}>
                Just started
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => handleMarkStatus("in_progress")}>
                In progress
              </button>
              <button type="button" className="btn btn-primary" onClick={() => handleMarkStatus("completed")}>
                Mark completed
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card empty-state">
          <p>No video source configured for this lesson.</p>
          {driveFolderUrl && (
            <p style={{ marginTop: 8, fontSize: "0.85rem" }}>
              <a href={driveFolderUrl} target="_blank" rel="noopener noreferrer">
                Browse the source folder on Google Drive
              </a>{" "}
              — copy the file&apos;s share link and add it as this lesson&apos;s <code>driveUrl</code> in{" "}
              <code>data/lessons.yaml</code>.
            </p>
          )}
        </div>
      )}

      {(lesson.localPath || lesson.driveUrl) && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span className={badgeClass(progress.status)}>{statusLabel(progress.status)}</span>
            {percent !== null && <span className="muted" style={{ fontSize: "0.85rem" }}>{percent}%</span>}
          </div>
          {lesson.localPath && percent !== null && (
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
