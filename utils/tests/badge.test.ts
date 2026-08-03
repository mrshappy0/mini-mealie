import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearBadge, showBadge } from '../badge';

// Mocking the Chrome API
beforeEach(() => {
    global.chrome = {
        action: {
            setBadgeText: vi.fn(),
        },
    } as unknown as typeof chrome;
});

describe('Badge Utility', () => {
    it('should set the badge text', () => {
        showBadge('✅');
        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✅' });
    });

    it('should clear the badge text', () => {
        clearBadge();
        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });

    it('should clear the badge after the specified duration', async () => {
        vi.useFakeTimers();

        showBadge('❌', 2);

        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '❌' });

        vi.advanceTimersByTime(2000);

        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });

        vi.useRealTimers();
    });

    it('should not let a stale timeout from an earlier badge clear a newer badge', () => {
        vi.useFakeTimers();

        showBadge('❌', 2);
        vi.advanceTimersByTime(1000);

        // A newer (persistent) badge is shown before the first badge's timer fires
        showBadge('✅');
        vi.advanceTimersByTime(2000);

        expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '✅' });

        vi.useRealTimers();
    });

    it('should reset a pending clear when a newer timed badge replaces it', () => {
        vi.useFakeTimers();

        showBadge('❌', 2);
        vi.advanceTimersByTime(1500);

        // New timed badge restarts the clock: old timer (due at 2000ms) must not fire at 500ms in
        showBadge('✅', 2);
        vi.advanceTimersByTime(1000);
        expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '✅' });

        vi.advanceTimersByTime(1000);
        expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });

        vi.useRealTimers();
    });
});
