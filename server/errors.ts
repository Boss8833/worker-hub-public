export class AppError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}
