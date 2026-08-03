/**
 * Shows a badge with the given text for a specified duration.
 * @param text - The text to display on the badge (e.g., ✅ or ❌).
 * @param duration - Optional duration in seconds.
 */
const getActionApi = () => chrome.action ?? chrome.browserAction;

// Pending auto-clear timer: a stale timeout from an earlier timed badge must not
// wipe a badge shown after it.
let clearTimer: ReturnType<typeof setTimeout> | undefined;

const cancelPendingClear = () => {
    if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = undefined;
    }
};

export const showBadge = (text: string, duration?: number) => {
    const action = getActionApi();
    if (!action?.setBadgeText) return;

    cancelPendingClear();
    void action.setBadgeText({ text });

    // Clear badge after the specified duration (in seconds) if duration provided
    if (duration) {
        clearTimer = setTimeout(() => {
            clearTimer = undefined;
            clearBadge();
        }, duration * 1000);
    }
};

export const clearBadge = () => {
    cancelPendingClear();

    const action = getActionApi();
    if (!action?.setBadgeText) return;
    if (action.setBadgeBackgroundColor) {
        void action.setBadgeBackgroundColor({ color: '#000000' });
    }
    void action.setBadgeText({ text: '' });
};
