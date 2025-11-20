/**
 * Popup UI entry point
 * This is the main React app for the extension popup (400x600px window)
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Render React app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
