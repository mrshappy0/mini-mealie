import { useEffect, useState } from 'react';

export function LogsPage() {
    const [events, setEvents] = useState<LogEvent[]>([]);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const loadEvents = async () => {
        const recent = await getRecentEvents(300);
        setEvents(recent);
    };

    useEffect(() => {
        // TODO: investigate if we can await this call
        void loadEvents();

        if (!autoRefresh) return;

        const handleChange = (
            changes: { [key: string]: chrome.storage.StorageChange },
            area: string,
        ) => {
            if (area === 'local' && Object.hasOwn(changes, EVENT_LOG_STORAGE_KEY)) {
                // TODO: investigate if we can await this call
                void loadEvents();
            }
        };

        if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
            chrome.storage.onChanged.addListener(handleChange);
            return () => chrome.storage.onChanged.removeListener(handleChange);
        }
    }, [autoRefresh]);

    const handleClear = async () => {
        if (confirm('Clear all logs?')) {
            await clearEvents();
            setEvents([]);
        }
    };

    const handleCopy = async () => {
        const text = events.map((e) => JSON.stringify(e)).join('\n');
        await navigator.clipboard.writeText(text);
        alert('Logs copied to clipboard');
    };

    const formatEvent = (e: LogEvent): string => {
        const timestamp = new Date(e.ts).toISOString();
        const phase = e.phase ? ` [${e.phase}]` : '';
        const opId = e.opId ? ` (${e.opId})` : '';
        const data = e.data ? ` | ${JSON.stringify(e.data)}` : '';
        return `${timestamp} ${e.level.toUpperCase().padEnd(5)} ${e.feature}/${e.action}${phase}${opId}: ${e.message}${data}`;
    };

    return (
        <div className="logs-page">
            <div className="logs-header">
                <h1>Mini Mealie Activity Logs</h1>
                <div className="logs-controls">
                    <label>
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                        />
                        Auto-refresh
                    </label>
                    <button onClick={loadEvents}>Refresh</button>
                    <button onClick={handleCopy}>Copy All</button>
                    <button onClick={handleClear}>Clear All</button>
                </div>
            </div>
            <div className="logs-content">
                {events.length === 0 ? (
                    <div className="logs-empty">No logs available</div>
                ) : (
                    <pre className="logs-text">{events.map(formatEvent).join('\n')}</pre>
                )}
            </div>
        </div>
    );
}
