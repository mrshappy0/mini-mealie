import './ActivityLog.css';

import { useEffect, useState } from 'react';

import { clearEvents, EVENT_LOG_STORAGE_KEY, getRecentEvents, LogEvent } from '@/utils/logging';

function formatTimestamp(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getLevelEmoji(level: LogEvent['level']): string {
    switch (level) {
        case 'error':
            return '❌';
        case 'warn':
            return '⚠️';
        case 'info':
            return 'ℹ️';
        case 'debug':
            return '🔍';
        default:
            return '•';
    }
}

function getPhaseLabel(phase?: LogEvent['phase']): string {
    switch (phase) {
        case 'start':
            return '▶';
        case 'success':
            return '✓';
        case 'failure':
            return '✗';
        case 'progress':
            return '…';
        default:
            return '';
    }
}

export function ActivityLog() {
    const [events, setEvents] = useState<LogEvent[]>([]);
    const [expanded, setExpanded] = useState(false);

    const loadEvents = async () => {
        const recent = await getRecentEvents(2);
        setEvents(recent.reverse());
    };

    useEffect(() => {
        // TODO: investigate if we can await this call
        void loadEvents();

        // Listen for storage changes to refresh
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
    }, []);

    const handleClear = async () => {
        await clearEvents();
        setEvents([]);
    };

    const handleCopy = async () => {
        const text = events
            .map(
                (e) =>
                    `[${formatTimestamp(e.ts)}] ${e.level.toUpperCase()} ${e.feature}/${e.action}: ${e.message}`,
            )
            .join('\n');
        await navigator.clipboard.writeText(text);
    };

    const handleOpenLogs = () => {
        // TODO: investigate if we can await this call
        void chrome.tabs.create({ url: chrome.runtime.getURL('logs.html') });
    };

    if (events.length === 0 && !expanded) {
        return (
            <div className="activity-log-empty">
                <button className="activity-log-toggle" onClick={() => setExpanded(!expanded)}>
                    Recent Activity
                </button>
            </div>
        );
    }

    return (
        <div className="activity-log">
            <div className="activity-log-header">
                <button className="activity-log-toggle" onClick={() => setExpanded(!expanded)}>
                    Recent Activity {expanded ? '▼' : '▶'}
                </button>
                {expanded && (
                    <div className="activity-log-actions">
                        <button onClick={handleOpenLogs} title="Open full logs">
                            📄
                        </button>
                        <button onClick={handleCopy} title="Copy logs">
                            📋
                        </button>
                        <button onClick={handleClear} title="Clear logs">
                            🗑️
                        </button>
                    </div>
                )}
            </div>

            {expanded && (
                <div className="activity-log-list">
                    {events.length === 0 ? (
                        <div className="activity-log-empty-message">No recent activity</div>
                    ) : (
                        events.map((event) => (
                            <div
                                key={event.id}
                                className={`activity-log-item activity-log-${event.level}`}
                            >
                                <span className="activity-log-time">
                                    {formatTimestamp(event.ts)}
                                </span>
                                <span className="activity-log-level">
                                    {getLevelEmoji(event.level)}
                                </span>
                                <span className="activity-log-phase">
                                    {getPhaseLabel(event.phase)}
                                </span>
                                <span className="activity-log-message">{event.message}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
