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
        chrome.storage.local.get([EVENT_LOG_STORAGE_KEY], (items: Record<string, unknown>) => {
            // eslint-disable-next-line security/detect-object-injection
            const rawEvents = Object.hasOwn(items, EVENT_LOG_STORAGE_KEY) ? items[EVENT_LOG_STORAGE_KEY] : undefined; // prettier-ignore
            if (Array.isArray(rawEvents)) {
                resolve(rawEvents as LogEvent[]);
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
