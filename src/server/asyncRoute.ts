import type { NextFunction, Request, Response, RequestHandler } from 'express';

export function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}
