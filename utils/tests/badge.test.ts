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
});
