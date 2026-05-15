import { LOG_PREFIX } from '../config';

export const log = (...args: unknown[]) => console.log(LOG_PREFIX, ...args);
export const warn = (...args: unknown[]) => console.warn(LOG_PREFIX, ...args);
export const error = (...args: unknown[]) => console.error(LOG_PREFIX, ...args);
