import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

import {Options} from './Options';
import '@/styles/global.css';

const container = document.getElementById('options-root');

if (!container) {
  throw new Error('Could not find the options root container');
}

createRoot(container).render(
  <StrictMode>
    <Options />
  </StrictMode>
);
