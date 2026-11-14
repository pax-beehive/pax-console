import { ApiError, AuthError, UserMessageError } from "./errors";

/**
 * What to tell the person using the app when a request fails, as an English
 * source string for t(). The server's own wording stays with administrators,
 * except when it is about what the person entered.
 */
export function publicErrorMessage(error: unknown): string {
  if (error instanceof UserMessageError) return error.message;
  if (error instanceof AuthError)
    return "Your sign-in has expired. Sign in again to continue.";
  if (error instanceof ApiError) {
    if (error.status === 404)
      return "This is no longer available. Reload the page and try again.";
    if (error.status === 409)
      return "This changed in the meantime. Reload the page and try again.";
    if (error.status === 429)
      return "Too many requests. Try again in a moment.";
    if (error.status >= 500)
      return "PAX is having trouble right now. Try again in a moment.";
    return "PAX did not accept this request.";
  }
  if (
    error instanceof TypeError &&
    /fetch|network|load failed/i.test(error.message)
  )
    return "PAX could not be reached. Check your connection and try again.";
  return "Something went wrong. Try again in a moment.";
}

/** Whether the server rejected what the person entered, so its reason helps them. */
export function isInputError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError && (error.status === 400 || error.status === 422)
  );
}
