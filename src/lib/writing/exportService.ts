import type { ManagedNovelChapter, WritingDraft } from '../../types/writing';

export interface WritingExportDocument {
  fileName: string;
  title: string;
  markdown: string;
}

export interface WritingExportService {
  downloadMarkdown(document: WritingExportDocument): void;
  downloadPlainText(document: WritingExportDocument): void;
  downloadNovel(title: string, chapters: readonly ManagedNovelChapter[]): void;
}

const sanitizeFileName = (value: string) => value
  .trim()
  .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '') || '未命名作品';

/*
 * 纯文本导出刻意保留段落结构，只移除可移植性较差的 Markdown 标记。
 * 原始 Markdown 始终可以单独下载，因此转换不承担“无损往返”的职责。
 */
export const writingMarkdownToPlainText = (source: string) => source
  .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/^>\s?(?:\[!FEATURED\]\s*)?/gm, '')
  .replace(/^:::annotation\s*(.*)$/gm, '作者批注：$1')
  .replace(/^:::\s*$/gm, '')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '图片：$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/\{\{旁注:([^}]+)\}\}/g, '（旁注：$1）')
  .replace(/\[\^([^\]]+)\]/g, '[$1]')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/~~([^~]+)~~/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\^\{([^}]+)\}/g, '$1')
  .replace(/_\{([^}]+)\}/g, '$1')
  .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
  .replace(/^[-*+]\s+/gm, '• ')
  .replace(/^(-{3,}|_{3,}|\*{3,})$/gm, '——')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

/* 静态站点使用浏览器下载；未来桌面端或服务器导出可替换同一 Service。 */
export class BrowserWritingExportService implements WritingExportService {
  private download(fileName: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  downloadMarkdown(document: WritingExportDocument) {
    this.download(
      `${sanitizeFileName(document.fileName || document.title)}.md`,
      document.markdown,
      'text/markdown;charset=utf-8',
    );
  }

  downloadPlainText(document: WritingExportDocument) {
    this.download(
      `${sanitizeFileName(document.fileName || document.title)}.txt`,
      writingMarkdownToPlainText(document.markdown),
      'text/plain;charset=utf-8',
    );
  }

  downloadNovel(title: string, chapters: readonly ManagedNovelChapter[]) {
    const body = [...chapters]
      .sort((left, right) => left.number - right.number)
      .map((chapter) => [
        `## 第 ${String(chapter.number).padStart(2, '0')} 章`,
        '',
        `### ${chapter.title}`,
        '',
        chapter.markdown.trim(),
      ].join('\n'))
      .join('\n\n---\n\n');
    this.downloadMarkdown({
      fileName: title,
      title,
      markdown: `# ${title}\n\n${body}\n`,
    });
  }
}

export const draftToExportDocument = (draft: WritingDraft): WritingExportDocument => ({
  fileName: draft.slug,
  title: draft.title,
  markdown: draft.markdown,
});
