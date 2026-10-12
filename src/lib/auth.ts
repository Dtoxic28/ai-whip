import { createHash, timingSafeEqual } from "node:crypto";
const hash = (text: string) => createHash("sha256").update(text).digest();
export function tokenMatches(value: string) { return !!process.env.AI_WHIP_AUTH_TOKEN && timingSafeEqual(hash(value), hash(process.env.AI_WHIP_AUTH_TOKEN)); }
export function authorize(request: Request, skipToken = false) {
  const url = new URL(request.url), host = request.headers.get("host") || url.host;
  const hostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, "");
  const local = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  const token = process.env.AI_WHIP_AUTH_TOKEN;
  if (!local && (process.env.AI_WHIP_ALLOW_REMOTE !== "true" || !token || token.length < 32)) return new Response("Remote access requires explicit configuration and a strong token.", { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && (new URL(origin).host !== host || new URL(origin).protocol !== url.protocol)) return new Response("Cross-origin request rejected.", { status: 403 });
  if (request.headers.get("sec-fetch-site") === "cross-site") return new Response("Cross-site request rejected.", { status: 403 });
  if (request.method !== "GET" && !origin && !request.headers.get("authorization")) return new Response("Mutations require an Origin or configured authorization token.", { status: 403 });
  if (!skipToken && token) {
    const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)whip_auth=([^;]+)/)?.[1];
    const value = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || (cookie ? decodeURIComponent(cookie) : "");
    if (!tokenMatches(value)) return new Response("Authentication required.", { status: 401 });
  }
  return null;
}
