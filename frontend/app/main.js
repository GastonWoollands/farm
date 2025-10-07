import { formatDisplayText } from './format.js';
import { setupExport } from './features/export.js';

// Load existing application logic (initialization, UI, sync, listeners)
import '../app.js';

// Minimal bootstrap to attach export dialog behavior without rewriting existing features
document.addEventListener('DOMContentLoaded', () => {
  setupExport();
});

export { formatDisplayText };


