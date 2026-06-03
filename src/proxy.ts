import { type NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

type RateRecord = { count: number; resetAt: number };
type RateConfig = { limit: number; windowMs: number };

const ipMap = new Map<string, RateRecord>();
const MAP_MAX = 5000;

const RATE_DEFAULT: RateConfig = { limit: 60, windowMs: 60_000 };
const RATE_POIS: RateConfig = { limit: 10, windowMs: 60_000 };
const RATE_WEATHER: RateConfig = { limit: 30, windowMs: 60_000 };
const RATE_HOURLY: RateConfig = { limit: 500, windowMs: 60 * 60 * 1000 };

const redisLimiterCache = new Map<string, Ratelimit>();

function getRedisLimiter(cfg: RateConfig, prefix: string): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const key = `${prefix}:${cfg.limit}:${cfg.windowMs}`;
  const cached = redisLimiterCache.get(key);
  if (cached) return cached;

  const redis = new Redis({ url, token });
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(cfg.limit, `${Math.ceil(cfg.windowMs / 1000)} s`),
    prefix,
    analytics: true,
  });
  redisLimiterCache.set(key, limiter);
  return limiter;
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded ? forwarded.split(",")[0] : "unknown").trim() || "unknown";
}

function checkRateLimit(key: string, cfg: RateConfig): boolean {
  const now = Date.now();
  if (ipMap.size >= MAP_MAX) ipMap.delete(ipMap.keys().next().value!);

  const record = ipMap.get(key);
  if (!record || now > record.resetAt) {
    ipMap.set(key, { count: 1, resetAt: now + cfg.windowMs });
    return true;
  }
  if (record.count >= cfg.limit) return false;
  record.count++;
  return true;
}

function rateForPath(pathname: string): RateConfig {
  if (pathname.startsWith("/api/pois")) return RATE_POIS;
  if (pathname.startsWith("/api/weather")) return RATE_WEATHER;
  return RATE_DEFAULT;
}

async function checkDistributedLimit(pathname: string, ip: string, cfg: RateConfig): Promise<boolean> {
  const minuteLimiter = getRedisLimiter(cfg, "rl:minute");
  const hourlyLimiter = getRedisLimiter(RATE_HOURLY, "rl:hour");
  if (!minuteLimiter || !hourlyLimiter) return checkRateLimit(`${pathname}:${ip}`, cfg);

  const minuteKey = `${pathname}:${ip}`;
  const hourKey = `${pathname}:${ip}`;
  const minuteRes = await minuteLimiter.limit(minuteKey);
  if (!minuteRes.success) return false;
  const hourRes = await hourlyLimiter.limit(hourKey);
  return hourRes.success;
}

export async function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const ip = getClientIp(request);
  const pathname = request.nextUrl.pathname;
  const cfg = rateForPath(pathname);

  const allowed = await checkDistributedLimit(pathname, ip, cfg);
  if (!allowed) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(cfg.windowMs / 1000)) },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
