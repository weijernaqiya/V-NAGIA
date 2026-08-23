const initializedArchives = new WeakSet<Element>();

const initializeWritingArchive = () => {
  const root = document.querySelector<HTMLElement>('[data-writing-archive]');
  if (!root || initializedArchives.has(root)) return;
  initializedArchives.add(root);

  const buttons = root.querySelectorAll<HTMLButtonElement>('[data-archive-filter]');
  const records = root.querySelectorAll<HTMLElement>('[data-archive-record]');
  const status = root.querySelector<HTMLElement>('[data-archive-status]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.archiveFilter ?? 'ALL';
      buttons.forEach((item) => { item.ariaPressed = String(item === button); });
      records.forEach((record) => {
        record.hidden = filter !== 'ALL' && record.dataset.archiveRecord !== filter;
      });
      const visibleCount = [...records].filter((record) => !record.hidden).length;
      if (status) status.textContent = `当前显示 ${String(visibleCount).padStart(2, '0')} 条记录`;
    });
  });
};

document.addEventListener('astro:page-load', initializeWritingArchive);
initializeWritingArchive();
