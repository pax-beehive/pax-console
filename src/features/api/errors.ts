export class AuthError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthError";
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function formatErrorDetail(error: Error) {
  if (error instanceof ApiError) {
    return `HTTP ${error.status}: ${error.message}`;
  }

  return error.name ? `${error.name}: ${error.message}` : error.message;
}
