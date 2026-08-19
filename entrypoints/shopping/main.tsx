import './style.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ShoppingPage } from './ShoppingPage';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ShoppingPage />
    </StrictMode>,
);
