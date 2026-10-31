import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import { TooltipProvider } from '@/components/ui/tooltip';
import { store } from '@/store';

import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root 挂载点，请检查 index.html');

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </Provider>
  </StrictMode>,
);
