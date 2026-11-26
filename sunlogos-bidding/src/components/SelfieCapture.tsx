"use client";

import { useEffect, useRef, useState } from "react";
import { compressSelfie } from "@/lib/selfie";

export function SelfieCapture({
  value,
  onChange,
  label = "Required selfie",
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  label?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  async function startCamera() {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLive(true);
    } catch {
      setCamError("Camera blocked — upload a photo instead.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }

  useEffect(() => () => stopCamera(), []);

  async function snap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return;
    onChange(await compressSelfie(blob));
    stopCamera();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    onChange(await compressSelfie(file));
    stopCamera();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-[0.22em] text-cream/50">{label}</p>
      {value ? (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Your selfie" className="h-28 w-28 rounded-full border-2 border-gold object-cover" />
          <button type="button" className="btn-ghost" onClick={() => onChange("")}>
            Retake
          </button>
        </div>
      ) : (
        <>
          <div className="relative aspect-square w-full overflow-hidden rounded-[1.5rem] border border-gold/25 bg-black/40">
            <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${live ? "" : "hidden"}`} />
            {!live && (
              <div className="flex h-full items-center justify-center px-6 text-center text-cream/50">
                Take a photo so the room can see who won.
              </div>
            )}
          </div>
          {camError && <p className="text-sm text-ember">{camError}</p>}
          <div className="flex flex-wrap gap-2">
            {!live ? (
              <button type="button" className="btn-gold" onClick={() => void startCamera()}>
                Open camera
              </button>
            ) : (
              <button type="button" className="btn-gold" onClick={() => void snap()}>
                Capture
              </button>
            )}
            <label className="btn-ghost cursor-pointer">
              Upload
              <input
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
