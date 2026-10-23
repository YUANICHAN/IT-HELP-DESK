export class AppError extends Error {
  constructor(status, code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = options.details;
  }
}

export function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
