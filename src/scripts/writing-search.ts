interface SearchEntry {
  id: string;
  type: string;
  title: string;
  titleEn: string;
  summary: string;
  tags: string[];
  text: string;
  href: string;
}

const initializedSearch = new WeakSet<Element>();
const typeLabels: Record<string, string> = {
  FICTION: '长篇小说',
  CHAPTER: '小说章节',
  SHORT_FICTION: '短篇小说',
  ESSAY: '文章',
  NOTE: '札记',
  WORLD: '世界档案',
  CHARACTER: '人物档案',
  LORE: '设定档案',
};

const initializeWritingSearch = () => {
  const root = document.querySelector<HTMLElement>('[data-writing-search]');
  if (!root || initializedSearch.has(root)) return;
  initializedSearch.add(root);

  const form = root.querySelector<HTMLFormElement>('[data-writing-search-form]');
  const input = root.querySelector<HTMLInputElement>('[data-writing-search-input]');
  const results = root.querySelector<HTMLOListElement>('[data-writing-search-results]');
  const status = root.querySelector<HTMLElement>('[data-writing-search-status]');
  const data = root.querySelector<HTMLScriptElement>('[data-writing-search-index]');
  if (!form || !input || !results || !status || !data?.textContent) return;

  let entries: SearchEntry[] = [];
  try {
    entries = JSON.parse(data.textContent) as SearchEntry[];
  } catch {
    status.textContent = '检索索引不可用';
    return;
  }

  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('zh-CN');
  const render = (query: string) => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    results.replaceChildren();

    if (terms.length === 0) {
      root.dataset.searchState = 'idle';
      status.textContent = '输入关键词开始检索。';
      return;
    }

    const matches = entries.filter((entry) => {
      const haystack = normalize([
        entry.title,
        entry.titleEn,
        entry.summary,
        entry.tags.join(' '),
        entry.text,
      ].join(' '));
      return terms.every((term) => haystack.includes(term));
    });

    root.dataset.searchState = matches.length > 0 ? 'results' : 'empty';
    status.textContent = matches.length > 0
      ? `找到 ${String(matches.length).padStart(2, '0')} 条记录`
      : '未找到记录';

    matches.forEach((entry, index) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      const number = document.createElement('span');
      const identity = document.createElement('span');
      const type = document.createElement('small');
      const title = document.createElement('strong');
      const chinese = document.createElement('span');
      const summary = document.createElement('p');

      link.href = entry.href;
      number.textContent = String(index + 1).padStart(2, '0');
      type.textContent = typeLabels[entry.type] ?? entry.type;
      title.textContent = entry.titleEn;
      chinese.textContent = entry.title;
      summary.textContent = entry.summary;
      identity.append(type, title, chinese);
      link.append(number, identity, summary);
      item.append(link);
      results.append(item);
    });
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    const url = new URL(window.location.href);
    query ? url.searchParams.set('q', query) : url.searchParams.delete('q');
    window.history.replaceState({}, '', url);
    render(query);
  });

  const initialQuery = new URL(window.location.href).searchParams.get('q') ?? '';
  input.value = initialQuery;
  render(initialQuery);
};

document.addEventListener('astro:page-load', initializeWritingSearch);
initializeWritingSearch();
