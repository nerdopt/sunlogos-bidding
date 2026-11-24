import { GameError } from "./types";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

export function handleError(error: unknown): Response {
  if (error instanceof GameError) return json({ error: error.message }, error.status);
  console.error(error);
  return json({ error: "Something went wrong" }, 500);
}

export function header(request: Request, name: string): string | undefined {
  return request.headers.get(name)?.trim() || undefined;
}
