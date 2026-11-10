import { z } from 'zod';
import type { Request, Response, RequestHandler } from 'express';

export const wrap = (fn: (req: Request, res: Response) => unknown): RequestHandler => (req, res, next) => {
  Promise.resolve().then(() => fn(req, res)).catch(next);
};

export const idParam = (req: Request, name = 'id'): number =>
  z.coerce.number().int().positive().parse(req.params[name]);

export const httpUrl = z.string().url().max(300).refine((u) => /^https?:\/\//i.test(u), 'Only http(s) URLs are allowed');
