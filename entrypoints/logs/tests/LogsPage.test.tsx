import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearEvents, getRecentEvents } from '@/utils/logging';

import { LogsPage } from '../LogsPage';

vi.mock('@/utils/logging', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/utils/logging')>();
    return {
        ...actual,
        getRecentEvents: vi.fn(),
        clearEvents: vi.fn(() => Promise.resolve()),
    };
});

const sampleEvent = {
    id: '1',
    ts: 0,
    level: 'info' as const,
    feature: 'recipe-create' as const,
    action: 'createFromUrl',
    phase: 'success' as const,
    message: 'Recipe created',
};

describe('LogsPage', () => {
    beforeEach(() => {
        fakeBrowser.reset();
        vi.clearAllMocks();
        vi.mocked(getRecentEvents).mockResolvedValue([]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('shows an empty state when there are no logs', async () => {
        render(<LogsPage />);

        expect(await screen.findByText('No logs available')).toBeInTheDocument();
        expect(getRecentEvents).toHaveBeenCalledWith(300);
    });

    it('renders formatted log events', async () => {
        vi.mocked(getRecentEvents).mockResolvedValue([sampleEvent]);

        render(<LogsPage />);

        expect(
            await screen.findByText(/recipe-create\/createFromUrl.*Recipe created/),
        ).toBeInTheDocument();
    });

    it('reloads events when the log storage changes and auto-refresh is on', async () => {
        render(<LogsPage />);
        await screen.findByText('No logs available');
        expect(getRecentEvents).toHaveBeenCalledTimes(1);

        vi.mocked(getRecentEvents).mockResolvedValue([sampleEvent]);
        await chrome.storage.local.set({ 'miniMealie.eventLog': [sampleEvent] });

        await waitFor(() => expect(getRecentEvents).toHaveBeenCalledTimes(2));
    });

    it('does not reload on storage changes once auto-refresh is turned off', async () => {
        const user = userEvent.setup();
        render(<LogsPage />);
        await screen.findByText('No logs available');

        const autoRefreshCheckbox = screen.getByRole('checkbox', { name: /auto-refresh/i });
        await user.click(autoRefreshCheckbox);
        expect(autoRefreshCheckbox).not.toBeChecked();

        vi.mocked(getRecentEvents).mockClear();
        await chrome.storage.local.set({ 'miniMealie.eventLog': [sampleEvent] });

        // Give any (unwanted) listener a chance to fire before asserting it didn't.
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(getRecentEvents).not.toHaveBeenCalled();
    });

    it('manually refreshes when the Refresh button is clicked', async () => {
        const user = userEvent.setup();
        render(<LogsPage />);
        await screen.findByText('No logs available');
        expect(getRecentEvents).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole('button', { name: 'Refresh' }));

        await waitFor(() => expect(getRecentEvents).toHaveBeenCalledTimes(2));
    });

    it('clears logs after confirming', async () => {
        vi.mocked(getRecentEvents).mockResolvedValue([sampleEvent]);
        vi.stubGlobal(
            'confirm',
            vi.fn(() => true),
        );
        const user = userEvent.setup();
        render(<LogsPage />);

        await screen.findByText(/Recipe created/);
        await user.click(screen.getByRole('button', { name: 'Clear All' }));

        expect(clearEvents).toHaveBeenCalled();
        expect(await screen.findByText('No logs available')).toBeInTheDocument();
    });

    it('does not clear logs when the confirmation is dismissed', async () => {
        vi.mocked(getRecentEvents).mockResolvedValue([sampleEvent]);
        vi.stubGlobal(
            'confirm',
            vi.fn(() => false),
        );
        const user = userEvent.setup();
        render(<LogsPage />);

        await screen.findByText(/Recipe created/);
        await user.click(screen.getByRole('button', { name: 'Clear All' }));

        expect(clearEvents).not.toHaveBeenCalled();
        expect(screen.getByText(/Recipe created/)).toBeInTheDocument();
    });

    it('copies formatted logs to the clipboard', async () => {
        // jsdom ships a real in-memory Clipboard implementation; spy on the
        // actual method rather than replacing `navigator.clipboard` (an
        // own-property override is inexplicably not observed by the
        // component — huge red flag, worth a closer look some day).
        const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText');
        vi.mocked(getRecentEvents).mockResolvedValue([sampleEvent]);
        vi.stubGlobal('alert', vi.fn());
        const user = userEvent.setup();
        render(<LogsPage />);

        await screen.findByText(/Recipe created/);
        await user.click(screen.getByRole('button', { name: 'Copy All' }));

        await waitFor(() =>
            expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('Recipe created')),
        );
        expect(alert).toHaveBeenCalledWith('Logs copied to clipboard');
        await expect(navigator.clipboard.readText()).resolves.toContain('Recipe created');
    });
});
