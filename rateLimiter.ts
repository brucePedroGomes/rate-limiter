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

    next();
  }

  

  
}
