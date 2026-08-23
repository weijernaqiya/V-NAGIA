const SECTION_THEME_KEY = 'asymptote.section.theme.v1';
type SectionTheme = 'dark' | 'light';

const initializedThemeSites = new WeakSet<Element>();

const getStoredTheme = (): SectionTheme => {
  const stored = window.localStorage.getItem(SECTION_THEME_KEY);
  return stored === 'light' ? 'light' : 'dark';
};

const initializeSectionTheme = () => {
  const site = document.querySelector<HTMLElement>('[data-section-site]');
  if (!site || initializedThemeSites.has(site)) return;
  initializedThemeSites.add(site);

  const button = site.querySelector<HTMLButtonElement>('[data-section-theme-toggle]');
  const label = button?.querySelector<HTMLElement>('[data-section-theme-label]');

  const applyTheme = (theme: SectionTheme, persist = true) => {
    site.dataset.sectionTheme = theme;
    document.documentElement.dataset.sectionTheme = theme;
    if (button) button.ariaPressed = String(theme === 'dark');
    if (label) label.textContent = theme === 'dark' ? '切换至浅色' : '切换至深色';
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === 'dark' ? '#11171c' : '#f8f8f5';
    if (persist) window.localStorage.setItem(SECTION_THEME_KEY, theme);
  };

  applyTheme(getStoredTheme(), false);
  button?.addEventListener('click', () => {
    applyTheme(site.dataset.sectionTheme === 'dark' ? 'light' : 'dark');
  });
};

document.addEventListener('astro:page-load', initializeSectionTheme);
initializeSectionTheme();
