import { todayIsoDate } from '../format.js';

export function setupExport() {
  const $exportDialog = document.getElementById('export-dialog');
  const $exportCsv = document.getElementById('export-csv');
  const $exportStartModal = document.getElementById('export-start-modal');
  const $exportEndModal = document.getElementById('export-end-modal');
  const $exportConfirm = document.getElementById('export-confirm');
  const $exportCancel = document.getElementById('export-cancel');

  if (!$exportCsv || !$exportDialog) return;

  $exportCsv.addEventListener('click', () => {
    const today = todayIsoDate();
    if ($exportEndModal && !$exportEndModal.value) $exportEndModal.value = today;
    if ($exportEndModal) $exportEndModal.max = today;
    if ($exportStartModal) $exportStartModal.max = today;
    $exportDialog.showModal();
  });

  $exportConfirm?.addEventListener('click', (e) => {
    e.preventDefault();
    // Delegate to existing exportData in app.js if present
    if (typeof window.exportData === 'function') {
      window.exportData('csv');
    }
    $exportDialog.close();
  });

  $exportCancel?.addEventListener('click', (e) => {
    e.preventDefault();
    $exportDialog.close();
  });
}


