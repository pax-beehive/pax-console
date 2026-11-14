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

/** An error whose message is already written for the person using the app. */
export class UserMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserMessageError";
  }
}

export function formatErrorDetail(error: Error) {
  if (error instanceof ApiError) {
    return `HTTP ${error.status}: ${error.message}`;
  }

  return error.name ? `${error.name}: ${error.message}` : error.message;
}
