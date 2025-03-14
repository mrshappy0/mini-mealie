import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './style.css';

function addGoogleAnalytics() {
    if (!document.getElementById('gtag-script')) {
        const script = document.createElement('script');
        script.id = 'gtag-script';
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=G-59Y1CN5WTK';
        document.head.appendChild(script);

        const inlineScript = document.createElement('script');
        inlineScript.textContent = `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-59Y1CN5WTK');
        `;
        document.head.appendChild(inlineScript);
    }
}

const RootApp = () => {
    useEffect(() => {
        addGoogleAnalytics();
    }, []);

    return <App />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <RootApp />
    </StrictMode>,
);
