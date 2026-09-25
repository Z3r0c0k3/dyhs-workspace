import React from 'react';
import { createRoot } from 'react-dom/client';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';
const App = import.meta.env.MODE === 'live'
  ? (await import('./LiveApp')).LiveApp
  : (await import('./App')).App;
if (import.meta.env.MODE === 'live') await import('./live.css');
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
