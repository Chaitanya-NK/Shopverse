/** A job that will never succeed (bad payload, missing setup): no retries. */
export class PermanentJobError extends Error {}
