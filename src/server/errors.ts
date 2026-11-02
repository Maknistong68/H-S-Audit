export type RemoteErrorKind = 'network' | 'permission' | 'validation' | 'auth' | 'unknown';

/** Every failure the sync engine and the screens need to tell apart, whatever the transport said. */
export class RemoteError extends Error {
  constructor(
    public kind: RemoteErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}
