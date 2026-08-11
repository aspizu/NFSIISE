import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import App from './App.tsx';
import './style.css';

const app = document.querySelector<HTMLElement>('#app');
if (!app)
  throw new Error('The React root element is missing.');

const root = createRoot(app);

flushSync(() => {
  root.render(<App />);
});

await import('./runtime.ts');
