import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

import {Popup} from './Popup';
import '@/styles/global.css';

const container = document.getElementById('popup-root');

if (!container) {
  throw new Error('Could not find the popup root container');
}

createRoot(container).render(
  <StrictMode>
    <Popup />
  </StrictMode>
);
