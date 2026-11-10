// Small, dependency-free security middleware: response headers and in-memory rate limiting.
//
// The limiter is per-process. That is the right trade-off for a single App Service instance:
// no extra infrastructure, and the durable abuse limits that matter for money (generation
// entitlements, login-code attempts) are enforced in PostgreSQL as well.

const buckets = new Map();
const MAX_BUCKETS = 50_000;

export function takeRateLimit(name, key, { limit, windowMs }, now = Date.now()) {
  const bucketKey = `${name}:${key}`;
  let bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      sweep(now);
    }
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(bucketKey, bucket);
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function resetRateLimits() {
  buckets.clear();
}

function sweep(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
  if (buckets.size >= MAX_BUCKETS) {
    buckets.clear();
  }
}

// Express middleware factory. `keyFn` picks what is being limited (defaults to client IP).
export function rateLimit(name, { limit, windowMs, keyFn, message = "Too many requests. Please wait and try again." }) {
  return (request, response, next) => {
    const key = (keyFn ? keyFn(request) : "") || request.ip || "unknown";
    const result = takeRateLimit(name, key, { limit, windowMs });
    if (!result.allowed) {
      response.set("Retry-After", String(result.retryAfterSeconds));
      response.status(429).json({ error: message, code: "RATE_LIMITED" });
      return;
    }
    next();
  };
}

export function securityHeaders(_request, response, next) {
  response.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cache-Control": "no-store",
  });
  next();
}
