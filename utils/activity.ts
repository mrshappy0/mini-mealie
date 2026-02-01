export type ActivityState = {
    activeCount: number;
    label?: string;
    opId?: string;
    startedAt?: number;
};

export const ACTIVITY_STORAGE_KEY = 'miniMealie.activity';

const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'];
const SPINNER_INTERVAL_MS = 200;

// In-memory state (service worker)
let activeCount = 0;
let currentLabel: string | undefined;
let currentOpId: string | undefined;
let startedAt: number | undefined;
let spinnerTimer: ReturnType<typeof setInterval> | undefined;
let spinnerIndex = 0;
let savedMenuTitle: string | undefined;

function startSpinner() {
    if (spinnerTimer) return;

    spinnerIndex = 0;
    spinnerTimer = setInterval(() => {
        const frame = SPINNER_FRAMES[spinnerIndex % SPINNER_FRAMES.length];
        spinnerIndex++;

        if (typeof chrome !== 'undefined' && chrome.action?.setBadgeText) {
            chrome.action.setBadgeText({ text: frame });
        }
        if (typeof chrome !== 'undefined' && chrome.action?.setBadgeBackgroundColor) {
            chrome.action.setBadgeBackgroundColor({ color: '#ec7e19' });
        }
    }, SPINNER_INTERVAL_MS);
}

function stopSpinner() {
    if (spinnerTimer) {
        clearInterval(spinnerTimer);
        spinnerTimer = undefined;
    }
}

async function writeActivityState(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

    const state: ActivityState = {
        activeCount,
        label: currentLabel,
        opId: currentOpId,
        startedAt,
    };

    return new Promise((resolve) => {
        chrome.storage.local.set({ [ACTIVITY_STORAGE_KEY]: state }, () => resolve());
    });
}

async function clearActivityState(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

    return new Promise((resolve) => {
        chrome.storage.local.remove([ACTIVITY_STORAGE_KEY], () => resolve());
    });
}

/**
 * Call when starting an operation. Starts spinner if first active op.
 */
export async function beginActivity(label: string, opId?: string): Promise<void> {
    activeCount++;
    currentLabel = label;
    currentOpId = opId;
    startedAt = startedAt ?? Date.now();

    // Update tooltip
    if (typeof chrome !== 'undefined' && chrome.action?.setTitle) {
        chrome.action.setTitle({ title: label });
    }

    // Update context menu to show busy state and disable it
    savedMenuTitle = savedMenuTitle ?? label;
    addContextMenu(`${label}…`, false);

    if (activeCount === 1) {
        startSpinner();
    }

    await writeActivityState();
}

/**
 * Call when an operation ends. Stops spinner when all ops complete.
 */
export async function endActivity(
    resultBadge?: '✅' | '❌',
    tooltipMessage?: string,
): Promise<void> {
    activeCount = Math.max(0, activeCount - 1);

    if (activeCount === 0) {
        stopSpinner();
        currentLabel = undefined;
        currentOpId = undefined;
        startedAt = undefined;

        // Show result badge
        if (resultBadge) {
            showBadge(resultBadge, 4);
        } else {
            clearBadge();
        }

        // Update tooltip with result
        if (tooltipMessage && typeof chrome !== 'undefined' && chrome.action?.setTitle) {
            chrome.action.setTitle({ title: tooltipMessage });
        }

        await clearActivityState();

        await checkStorageAndUpdateBadge();
    } else {
        await writeActivityState();
    }
}

/**
 * Check if any activity is in progress.
 */
export function isActivityActive(): boolean {
    return activeCount > 0;
}

/**
 * Get current activity state (for popup to read).
 */
export async function getActivityState(): Promise<ActivityState | null> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;

    return new Promise((resolve) => {
        chrome.storage.local.get([ACTIVITY_STORAGE_KEY], (items) => {
            const state = Object.hasOwn(items, ACTIVITY_STORAGE_KEY)
                ? (items as Record<string, unknown>)[ACTIVITY_STORAGE_KEY as keyof typeof items]
                : undefined;
            if (state && typeof state === 'object' && 'activeCount' in state) {
                resolve(state as ActivityState);
            } else {
                resolve(null);
            }
        });
    });
}
