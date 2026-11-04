import type { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500 | 503,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'That record') => new HttpError(404, 'not_found', `${what} could not be found.`);
export const forbidden = (message = 'Your role does not allow this.') => new HttpError(403, 'forbidden', message);
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Sign in to continue.');
export const conflict = (message: string) => new HttpError(409, 'conflict', message);
export const badRequest = (message: string) => new HttpError(400, 'bad_request', message);

export function validationError(error: ZodError): HttpError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = Object.values(fields)[0] ?? 'Check the details and try again.';
  return new HttpError(422, 'invalid_input', first, fields);
}
