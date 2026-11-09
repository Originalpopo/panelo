import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles.css';
import { useStore } from './store.ts';
import { importFiles } from './photos.ts';

// Dev-only hook so the app can be tried in a desktop preview without a photo picker.
if (import.meta.env.DEV) Object.assign(window, { __panelo: { useStore, importFiles } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
