"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, X, ImageOff } from "lucide-react";

export type ImageScope = "company" | "personal";

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
const MAX_BYTES = 20 * 1024 * 1024;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Post = any;

interface PostImageDropZoneProps {
  post: Post;
  scope: ImageScope;
  /** The scope's current image, or null. Drives empty vs filled state. */
  imageUrl: string | null;
  /** False when the scope has no post text — the zone greys out entirely. */
  enabled: boolean;
  onUpdated: (post: Post) => void;
  onNotice: (text: string) => void;
}

/** "abc-company.png" out of the public URL, for the filename line. */
function nameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
  } catch {
    return "image";
  }
}

export function PostImageDropZone({
  post,
  scope,
  imageUrl,
  enabled,
  onUpdated,
  onNotice,
}: PostImageDropZoneProps) {
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Only known for a file picked in this session; on reload the URL is all
  // there is, so fall back to its last path segment.
  const [localName, setLocalName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      onNotice(`${file.name} is not a PNG or JPG.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      onNotice(
        `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 20 MB.`
      );
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("scope", scope);

      const res = await fetch(`/api/posts/${post.id}/image`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));

      // Nothing is written to the post unless the upload actually succeeded,
      // so a failure leaves the zone exactly as it was.
      if (!res.ok) {
        onNotice(data.error || "Upload failed.");
        return;
      }

      setLocalName(file.name);
      onUpdated(data);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/image`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotice(data.error || "Could not remove the image.");
        return;
      }
      setLocalName(null);
      onUpdated(data);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "Could not remove the image.");
    } finally {
      setBusy(false);
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) upload(file);
  }

  // A scope with no post text has nothing to attach an image to.
  if (!enabled) {
    return (
      <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-xs text-gray-400">
        <ImageOff className="h-3.5 w-3.5" />
        No image slot
      </div>
    );
  }

  if (busy) {
    return (
      <div className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-6 text-xs text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
        Uploading…
      </div>
    );
  }

  if (imageUrl) {
    return (
      <div className="mt-2 rounded-lg border p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`${scope} post image`}
          className="mx-auto max-h-40 w-auto object-contain"
        />
        <div className="mt-2 flex items-center gap-2">
          <span className="truncate text-xs text-gray-500" title={localName || nameFromUrl(imageUrl)}>
            {localName || nameFromUrl(imageUrl)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-500 hover:text-red-600"
              onClick={handleRemove}
              aria-label={`Remove ${scope} image`}
              title="Remove image"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            // Reset so picking the same file twice still fires onChange.
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-3 py-5 text-center transition-colors ${
        dragging
          ? "border-blue-400 bg-blue-50"
          : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
      }`}
    >
      <Upload className="h-5 w-5 text-gray-400" />
      <span className="mt-1.5 text-xs font-medium text-gray-600">
        Drop image or click
      </span>
      <span className="text-[11px] text-gray-400">PNG or JPG · 1:1 preferred</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
