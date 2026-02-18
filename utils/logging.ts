/**
 * Event logging for Mini Mealie.
 * Stores structured events in chrome.storage.local as a ring buffer.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFeature =
    | 'auth'
    | 'recipe-create'
    | 'recipe-detect'
    | 'html-capture'
    | 'network'
    | 'storage'
    | 'duplicate-detect';

export type LogEvent = {
    id: string;
    ts: number;
    level: LogLevel;
    feature: LogFeature;
    action: string;
    phase?: 'start' | 'progress' | 'success' | 'failure';
    opId?: string;
    message: string;
    data?: Record<string, unknown>;
    durationMs?: number;
};

export const EVENT_LOG_STORAGE_KEY = 'miniMealie.eventLog';
const MAX_EVENTS = 300;

function generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Sanitize a URL to only include origin + pathname (no query/hash).
 */
export function sanitizeUrl(url: string): string {
    try {
        const u = new URL(url);
        return `${u.origin}${u.pathname}`;
    } catch {
        return '[invalid-url]';
    }
}

/**
 * Sanitize data object - removes anything that looks like a token.
 */
function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        // Skip keys that might contain sensitive data
        if (/token|password|secret|auth|key|credential/i.test(key)) {
            continue;
        }
        if (typeof value === 'string' && value.length > 500) {
            Object.defineProperty(result, key, {
                value: `[string, ${value.length} chars]`,
                writable: true,
                enumerable: true,
                configurable: true,
            });
        } else {
            Object.defineProperty(result, key, {
                value,
                writable: true,
                enumerable: true,
                configurable: true,
            });
        }
    }
    return result;
}

async function readEvents(): Promise<LogEvent[]> {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) {
            resolve([]);
            return;
        }
        chrome.storage.local.get([EVENT_LOG_STORAGE_KEY], (items) => {
            const events = Object.hasOwn(items, EVENT_LOG_STORAGE_KEY)
                ? (items as Record<string, unknown>)[EVENT_LOG_STORAGE_KEY as keyof typeof items]
                : undefined;
            if (Array.isArray(events)) {
                resolve(events as LogEvent[]);
            } else {
                resolve([]);
            }
        });
    });
}

async function writeEvents(events: LogEvent[]): Promise<void> {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) {
            resolve();
            return;
        }
        chrome.storage.local.set({ [EVENT_LOG_STORAGE_KEY]: events }, () => {
            resolve();
        });
    });
}

/**
 * Log a single event. Appends to the ring buffer.
 */
export async function logEvent(
    event: Omit<LogEvent, 'id' | 'ts'> & { id?: string; ts?: number },
): Promise<string> {
    const id = event.id ?? generateId();
    const ts = event.ts ?? Date.now();

    const fullEvent: LogEvent = {
        ...event,
        id,
        ts,
        data: event.data ? sanitizeData(event.data) : undefined,
    };

    const events = await readEvents();
    events.push(fullEvent);

    // Trim to max size (ring buffer)
    const trimmed = events.length > MAX_EVENTS ? events.slice(-MAX_EVENTS) : events;
    await writeEvents(trimmed);

    // Also log to console for dev visibility
    const consoleMethod = fullEvent.level === 'error' ? console.error : console.log;
    consoleMethod(`[${fullEvent.feature}/${fullEvent.action}] ${fullEvent.message}`, fullEvent);

    return id;
}

/**
 * Get recent events from the log.
 */
export async function getRecentEvents(limit = 50): Promise<LogEvent[]> {
    const events = await readEvents();
    return events.slice(-limit);
}

/**
 * Clear all events from the log.
 */
export async function clearEvents(): Promise<void> {
    await writeEvents([]);
}

/**
 * Helper to wrap an async operation with start/success/failure logging.
 */
export async function withOperation<T>(
    config: {
        feature: LogFeature;
        action: string;
        message: string;
        data?: Record<string, unknown>;
    },
    fn: () => Promise<T>,
    isSuccess?: (result: T) => boolean,
): Promise<T> {
    const opId = generateId();
    const startTime = Date.now();

    await logEvent({
        level: 'info',
        feature: config.feature,
        action: config.action,
        phase: 'start',
        opId,
        message: config.message,
        data: config.data,
    });

    try {
        const result = await fn();
        const durationMs = Date.now() - startTime;
        const success = isSuccess ? isSuccess(result) : true;

        await logEvent({
            level: success ? 'info' : 'warn',
            feature: config.feature,
            action: config.action,
            phase: success ? 'success' : 'failure',
            opId,
            message: `${config.message} ${success ? '(success)' : '(failed)'}`,
            durationMs,
            data: config.data,
        });

        return result;
    } catch (error) {
        const durationMs = Date.now() - startTime;

        await logEvent({
            level: 'error',
            feature: config.feature,
            action: config.action,
            phase: 'failure',
            opId,
            message: `${config.message} (error: ${error instanceof Error ? error.message : 'Unknown'})`,
            durationMs,
            data: config.data,
        });

        throw error;
    }
}
