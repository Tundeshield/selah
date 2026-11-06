import * as http from "http";
import type { AddressInfo } from "net";
import type { Readable } from "stream";
import { bucket } from "./admin";

/**
 * The static ffmpeg build crashes (SIGSEGV) when it has to resolve DNS names
 * inside Cloud Functions. Instead of giving ffmpeg a remote URL, we serve the
 * media from this Node process on 127.0.0.1 (numeric address, no DNS) and
 * stream bytes from Cloud Storage with full HTTP Range support, so ffmpeg can
 * seek exactly as it would with a normal web server.
 */

export interface MediaSource {
  size: number;
  contentType: string;
  open(start: number, end: number): Readable; // inclusive end
}

export function storageSource(path: string): Promise<MediaSource> {
  const file = bucket().file(path);
  return file.getMetadata().then(([meta]) => ({
    size: Number(meta.size),
    contentType: String(meta.contentType || "application/octet-stream"),
    open: (start: number, end: number) => file.createReadStream({ start, end, validation: false }),
  }));
}

export async function serveMedia<T>(source: MediaSource, fn: (url: string) => Promise<T>): Promise<T> {
  const server = http.createServer((req, res) => {
    const total = source.size;
    let start = 0;
    let end = total - 1;
    let partial = false;
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (m) {
        if (m[1] === "" && m[2] !== "") {
          start = Math.max(0, total - Number(m[2]));
        } else {
          start = Number(m[1] || 0);
          if (m[2] !== "") end = Math.min(Number(m[2]), total - 1);
        }
        partial = true;
      }
      if (start > end || start >= total) {
        res.writeHead(416, { "Content-Range": `bytes */${total}` });
        return res.end();
      }
    }
    const headers: Record<string, string | number> = {
      "Content-Type": source.contentType,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
    };
    if (partial) headers["Content-Range"] = `bytes ${start}-${end}/${total}`;
    res.writeHead(partial ? 206 : 200, headers);
    if (req.method === "HEAD") return res.end();
    const stream = source.open(start, end);
    stream.on("error", () => res.destroy());
    req.on("close", () => stream.destroy());
    stream.pipe(res);
  });
  server.keepAliveTimeout = 30_000;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const ext = source.contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
  try {
    return await fn(`http://127.0.0.1:${port}/media.${ext}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Serve a Storage object to ffmpeg for the duration of `fn`. */
export async function withStorageMedia<T>(path: string, fn: (url: string) => Promise<T>): Promise<T> {
  return serveMedia(await storageSource(path), fn);
}
