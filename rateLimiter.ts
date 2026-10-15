import { NextFunction, Request, Response } from "express";

export class RateLimit {
  private readonly rateLimitStorage: Map<string, number[]>;
  private readonly options: { limit: number; windowMs: number };

  constructor(options = { limit: 10, windowMs: 60000 }) {
    this.rateLimitStorage = new Map();
    this.options = options;
    this.middleware = this.middleware.bind(this);
  }

  middleware(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip ?? "";
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    const savedTimes = this.rateLimitStorage.get(ip) ?? [];
    const recentTimes = savedTimes.filter((time) => time > windowStart);
    const isFull = recentTimes.length >= this.options.limit;

    if (!isFull) {
      recentTimes.push(now);
    }
    this.rateLimitStorage.set(ip, recentTimes);

    const oldestLeavesAt = recentTimes[0] + this.options.windowMs;

    res.setHeader("X-RateLimit-Limit", this.options.limit);
    res.setHeader("X-RateLimit-Remaining", this.options.limit - recentTimes.length);
    res.setHeader("X-RateLimit-Reset", Math.ceil(oldestLeavesAt / 1000));

    if (isFull) {
      const secondsToWait = Math.ceil((oldestLeavesAt - now) / 1000);
      res.setHeader("Retry-After", secondsToWait);
      return res.status(429).json({ error: "Too many requests" });
    }

    next();
  }
}
