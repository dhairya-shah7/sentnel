import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: '#FBF6EA',
          color: '#5F2E23',
          border: '1px solid rgba(122,61,44,0.14)',
          fontSize: '13px',
          fontWeight: '700',
          letterSpacing: '0.015em',
          borderRadius: '0',
        },
        success: { iconTheme: { primary: '#485935', secondary: '#FBF6EA' } },
        error: { iconTheme: { primary: '#9A4F3D', secondary: '#FBF6EA' } },
      }}
    />
  </React.StrictMode>
);
