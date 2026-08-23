interface ReadingPreferences {
  fontSize: number;
  width: number;
  lineHeight: number;
  letterSpacing: number;
}

interface ReadingProgressRecord {
  path: string;
  title: string;
  ratio: number;
  updatedAt: string;
}

const PREFERENCE_KEY = 'asymptote.writing.reader.v1';
const PROGRESS_KEY = 'asymptote.writing.progress.v1';
const initializedSites = new WeakSet<Element>();

const defaults: ReadingPreferences = {
  fontSize: 19,
  width: 720,
  lineHeight: 1.95,
  letterSpacing: 0.04,
};

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(
  maximum,
  Math.max(minimum, value),
);

const initializeWritingReader = () => {
  const site = document.querySelector<HTMLElement>('[data-writing-site]');
  if (!site || initializedSites.has(site)) return;
  initializedSites.add(site);

  const stored = readJson<Partial<ReadingPreferences>>(PREFERENCE_KEY, {});
  const preferences: ReadingPreferences = {
    fontSize: clamp(Number(stored.fontSize ?? defaults.fontSize), 16, 24),
    width: clamp(Number(stored.width ?? defaults.width), 620, 820),
    lineHeight: clamp(Number(stored.lineHeight ?? defaults.lineHeight), 1.7, 2.2),
    letterSpacing: clamp(Number(stored.letterSpacing ?? defaults.letterSpacing), 0, 0.12),
  };

  const applyPreferences = () => {
    site.style.setProperty('--reader-font-size', `${preferences.fontSize}px`);
    site.style.setProperty('--reader-width', `${preferences.width}px`);
    site.style.setProperty('--reader-line-height', String(preferences.lineHeight));
    site.style.setProperty('--reader-letter-spacing', `${preferences.letterSpacing}em`);
    window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences));
  };

  applyPreferences();

  const settings = site.querySelector<HTMLElement>('[data-reading-settings]');
  const panel = settings?.querySelector<HTMLElement>('[data-reading-settings-panel]');
  const toggle = settings?.querySelector<HTMLButtonElement>('[data-reading-settings-toggle]');
  const closeSettings = settings?.querySelector<HTMLButtonElement>('[data-reading-settings-close]');
  const setSettingsOpen = (open: boolean) => {
    if (!panel || !toggle) return;
    settings?.toggleAttribute('data-open', open);
    panel.ariaHidden = String(!open);
    toggle.ariaExpanded = String(open);
  };

  toggle?.addEventListener('click', () => setSettingsOpen(!settings?.hasAttribute('data-open')));
  closeSettings?.addEventListener('click', () => {
    setSettingsOpen(false);
    toggle?.focus({ preventScroll: true });
  });

  const bindRange = (
    selector: string,
    key: 'fontSize' | 'width' | 'lineHeight' | 'letterSpacing',
  ) => {
    const input = settings?.querySelector<HTMLInputElement>(selector);
    if (!input) return;
    input.value = String(preferences[key]);
    input.addEventListener('input', () => {
      preferences[key] = Number(input.value);
      applyPreferences();
    });
  };

  bindRange('[data-reading-font-size]', 'fontSize');
  bindRange('[data-reading-width]', 'width');
  bindRange('[data-reading-line-height]', 'lineHeight');
  bindRange('[data-reading-letter-spacing]', 'letterSpacing');

  const toc = site.querySelector<HTMLElement>('[data-writing-toc]');
  const tocToggle = toc?.querySelector<HTMLButtonElement>('[data-writing-toc-toggle]');
  tocToggle?.addEventListener('click', () => {
    const open = !toc?.hasAttribute('data-open');
    toc?.toggleAttribute('data-open', open);
    tocToggle.ariaExpanded = String(open);
  });
  toc?.querySelectorAll<HTMLAnchorElement>('[data-writing-toc-link]').forEach((link) => {
    link.addEventListener('click', () => {
      toc?.removeAttribute('data-open');
      if (tocToggle) tocToggle.ariaExpanded = 'false';
    });
  });

  site.querySelectorAll<HTMLButtonElement>('[data-margin-note-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const note = button.closest<HTMLElement>('.writing-margin-note');
      const open = !note?.hasAttribute('data-open');
      note?.toggleAttribute('data-open', open);
      button.ariaExpanded = String(open);
      button.ariaLabel = open ? '收起旁注' : '展开旁注';
    });
  });

  /* 段落与章节锚点保持正常跳转，同时把稳定 URL 写入剪贴板。 */
  site.querySelectorAll<HTMLAnchorElement>(
    '.writing-prose__anchor, .writing-prose__paragraph-anchor',
  ).forEach((anchor) => {
    anchor.addEventListener('click', async () => {
      const url = new URL(anchor.getAttribute('href') ?? '', window.location.href).href;
      try {
        await navigator.clipboard.writeText(url);
        anchor.dataset.copied = 'true';
        anchor.ariaLabel = '链接已复制';
        window.setTimeout(() => {
          delete anchor.dataset.copied;
          anchor.ariaLabel = anchor.classList.contains('writing-prose__paragraph-anchor')
            ? '复制此段链接'
            : '复制此章节链接';
        }, 1800);
      } catch {
        // 无剪贴板权限时仍保留原生锚点跳转，不阻断阅读。
      }
    });
  });

  const observedHeadings = [...site.querySelectorAll<HTMLElement>('.writing-prose h2, .writing-prose h3')];
  if ('IntersectionObserver' in window && observedHeadings.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.find((entry) => entry.isIntersecting);
      if (!visible) return;
      toc?.querySelectorAll('[data-writing-toc-link]').forEach((link) => {
        link.toggleAttribute('aria-current', (link as HTMLElement).dataset.writingTocLink === visible.target.id);
      });
    }, { rootMargin: '-18% 0px -68% 0px', threshold: 0 });
    observedHeadings.forEach((heading) => observer.observe(heading));
  }

  const reader = site.querySelector<HTMLElement>('[data-writing-reader]');
  const progressLine = reader?.querySelector<HTMLElement>('[data-reading-progress]');
  let progressFrame = 0;
  const updateProgress = () => {
    progressFrame = 0;
    if (!reader || !progressLine) return;
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const ratio = clamp(window.scrollY / scrollable, 0, 1);
    progressLine.style.transform = `scaleX(${ratio})`;

    const key = reader.dataset.writingProgressKey;
    if (!key) return;
    const records = readJson<Record<string, ReadingProgressRecord>>(PROGRESS_KEY, {});
    records[key] = {
      path: window.location.pathname,
      title: reader.dataset.writingProgressTitle ?? document.title,
      ratio,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(records));
  };

  window.addEventListener('scroll', () => {
    if (!progressFrame) progressFrame = window.requestAnimationFrame(updateProgress);
  }, { passive: true });
  updateProgress();

  /* 小说页只提供继续阅读入口，不擅自把读者跳回上次滚动位置。 */
  site.querySelectorAll<HTMLAnchorElement>('[data-writing-continue]').forEach((link) => {
    const key = link.dataset.writingContinue;
    const record = key ? readJson<Record<string, ReadingProgressRecord>>(PROGRESS_KEY, {})[key] : null;
    if (!record?.path.startsWith('/writing/fiction/')) return;
    link.href = record.path;
    const label = link.querySelector('[data-writing-continue-label]');
    if (label) label.textContent = `继续阅读 / ${record.title}`;
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (event.key === 'Escape' && settings?.hasAttribute('data-open')) {
      setSettingsOpen(false);
      toggle?.focus({ preventScroll: true });
      return;
    }
    if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft') {
      const previous = site.querySelector<HTMLAnchorElement>('[data-chapter-previous]');
      if (previous) window.location.assign(previous.href);
    }
    if (event.key === 'ArrowRight') {
      const next = site.querySelector<HTMLAnchorElement>('[data-chapter-next]');
      if (next) window.location.assign(next.href);
    }
  });
};

document.addEventListener('astro:page-load', initializeWritingReader);
initializeWritingReader();
