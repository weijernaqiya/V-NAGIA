export interface TimedLyricLine {
  time: number;
  text: string;
}

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/*
 * LRC 解析器只处理用户自己导入的文本，不抓取第三方歌词。
 * 同一行可含多个时间标签；无法识别的元数据行会被安全忽略。
 */
export const parseLrc = (source: string): TimedLyricLine[] => {
  const result: TimedLyricLine[] = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const tags = [...rawLine.matchAll(TIME_TAG)];
    if (tags.length === 0) continue;
    const text = rawLine.replace(TIME_TAG, '').trim();

    for (const tag of tags) {
      const minutes = Number(tag[1]);
      const seconds = Number(tag[2]);
      const fraction = tag[3] ? Number(`0.${tag[3]}`) : 0;
      result.push({ time: minutes * 60 + seconds + fraction, text });
    }
  }

  return result.sort((a, b) => a.time - b.time);
};
