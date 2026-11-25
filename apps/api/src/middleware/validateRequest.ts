import type { RequestHandler, Response } from "express";
import type { ZodType } from "zod";

/**
 * Express 5 makes `req.query` read-only, so parsed values go to
 * `res.locals.validated` and controllers read them with `getValidated`.
 */
export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export interface Validated<TBody = unknown, TQuery = unknown, TParams = unknown> {
  body: TBody;
  query: TQuery;
  params: TParams;
}

export const validateRequest = (schemas: RequestSchemas): RequestHandler => (req, res, next) => {
  try {
    const validated: Partial<Validated> = {};

    if (schemas.body) validated.body = schemas.body.parse(req.body);
    if (schemas.query) validated.query = schemas.query.parse(req.query);
    if (schemas.params) validated.params = schemas.params.parse(req.params);

    res.locals.validated = validated;
    next();
  } catch (error) {
    next(error);
  }
};

/** Typed accessor for whatever `validateRequest` stored. */
export const getValidated = <TBody = unknown, TQuery = unknown, TParams = unknown>(
  res: Response,
): Validated<TBody, TQuery, TParams> =>
  (res.locals.validated ?? { body: undefined, query: undefined, params: undefined }) as Validated<
    TBody,
    TQuery,
    TParams
  >;
