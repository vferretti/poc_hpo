// INTEGRATION: This file is the POC entry point. Not needed in clin.
// In clin, the antd CSS and theme are already imported in src/index.js.
// The ./index.css file (clin-portal-theme variables) can also be deleted.
import React from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/antd.css';
import './index.css';
import App from './App.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
