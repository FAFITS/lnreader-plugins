void (async () => {
  const reader = window.nekori;
  if (!reader) return;
  await reader.ready;

  const bindCheckpoints = (root: Element) => {
    root.querySelectorAll<HTMLElement>('.hameln-checkpoint').forEach(box => {
      if (box.dataset.hamelnBound === '1') return;
      box.dataset.hamelnBound = '1';
      const btn = box.querySelector<HTMLButtonElement>('.hameln-retry-btn');
      if (!btn) return;
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = 'Đang tải lại... / Reloading...';
        reader.refetch();
      });
    });
  };

  const container =
    document.querySelector('#nekori-reader, [data-nekori-reader-root]') ||
    document.body;
  if (!container) return;

  bindCheckpoints(container);

  const observer = new MutationObserver(() => {
    bindCheckpoints(container);
  });
  observer.observe(container, { childList: true, subtree: true });
})().catch(error => window.nekori?.error(String(error)));
