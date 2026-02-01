import './style.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { LogsPage } from './LogsPage';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <LogsPage />
    </StrictMode>,
);
