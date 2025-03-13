import { describe, it, expect, beforeEach } from 'vitest';

describe('isLoggedIn', () => {
    beforeEach(() => {
        // See https://webext-core.aklinker1.io/fake-browser/reseting-state
        fakeBrowser.reset();
    });

    it('first test', async () => {
        expect(true).toBe(true);
    });
});
