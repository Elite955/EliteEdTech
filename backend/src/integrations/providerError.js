export class ProviderError extends Error {
  constructor(message, { status = 502, outcomeUncertain = false } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.outcomeUncertain = outcomeUncertain;
  }
}
