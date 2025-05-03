import { toRaw } from 'vue';
import type { ComputedRef } from 'vue';
import type { Store } from 'pinia';

export interface LyricWord {
  word: string;
  startTime: number;
  endTime: number;
}

export interface LyricLine {
  startTime: number;
  endTime: number;
  words: LyricWord[];
  translatedLyric: string;
  romanLyric: string;
  isBG: boolean;
  isDuet: boolean;
}

export interface SongLyric {
  lrcAMData: LyricLine[];
  yrcAMData: LyricLine[];
  hasTTML?: boolean;    // 是否拥有TTML格式歌词
  ttml?: LyricLine[];   // TTML解析后的数据
}

export interface SettingState {
  showYrc: boolean;
  showRoma: boolean;
  showTransl: boolean;
}

// 创建一个工厂函数来处理歌词
export function createLyricsProcessor(songLyric: SongLyric, settings: SettingState): LyricLine[] {
  // 优先级顺序：TTML > YRC > LRC
  let rawLyrics: LyricLine[] = [];

  // 如果有TTML格式歌词并且数据非空，优先使用TTML
  if (songLyric.hasTTML && songLyric.ttml && songLyric.ttml.length > 0) {
    console.log('[createLyricsProcessor] 使用TTML格式歌词');
    rawLyrics = toRaw(songLyric.ttml);
  }
  // 否则，如果设置了显示逐字歌词且有YRC数据，使用YRC
  else if (settings.showYrc && songLyric.yrcAMData?.length) {
    console.log('[createLyricsProcessor] 使用YRC格式歌词');
    rawLyrics = toRaw(songLyric.yrcAMData);
  }
  // 最后，使用LRC格式
  else {
    console.log('[createLyricsProcessor] 使用LRC格式歌词');
    rawLyrics = toRaw(songLyric.lrcAMData) || [];
  }

  return rawLyrics.map((line: LyricLine) => {
    const rawLine = toRaw(line);
    
    // 定义特殊字符集合，这些字符前后不应添加空格
    const specialChars = new Set(["'", "'", "'", "-", "…", ".", "'", "?", "'"]);
    
    // 检测是否包含中文字符的函数
    const containsChinese = (text: string): boolean => {
      return /[\u4e00-\u9fa5]/.test(text);
    };

    // 检查字符串是否以特殊字符开头或结尾
    const hasSpecialCharAtBoundary = (text: string): boolean => {
      if (!text || text.length === 0) return false;
      const firstChar = text.charAt(0);
      const lastChar = text.charAt(text.length - 1);
      return specialChars.has(firstChar) || specialChars.has(lastChar);
    };
    
    const processedWords = toRaw(rawLine.words).reduce<LyricWord[]>((acc, word, index, array) => {
      // 添加当前单词，去除两端空格
      acc.push({
        startTime: word.startTime,
        endTime: word.endTime,
        word: word.word.trim()
      });
      
      // 如果不是最后一个单词，考虑添加空格
      if (index < array.length - 1) {
        const currentWord = word.word.trim();
        const nextWord = array[index + 1].word.trim();
        
        // 判断条件：
        // 1. 当前词和下一个词都不是特殊字符本身
        // 2. 当前词不以特殊字符结尾，下一个词不以特殊字符开头
        // 3. 当前词和下一个词都不包含中文
        if (!specialChars.has(currentWord) && 
            !specialChars.has(nextWord) && 
            !hasSpecialCharAtBoundary(currentWord) && 
            !hasSpecialCharAtBoundary(nextWord) &&
            !containsChinese(currentWord) && 
            !containsChinese(nextWord)) {
          acc.push({
            word: "\u00A0",
            startTime: 0,
            endTime: 0
          });
        }
      }
      
      return acc;
    }, []);

    return {
      startTime: rawLine.startTime,
      endTime: rawLine.endTime,
      words: processedWords,
      translatedLyric: settings.showTransl ? rawLine.translatedLyric : "",
      romanLyric: settings.showRoma ? rawLine.romanLyric : "",
      isBG: rawLine.isBG,
      isDuet: rawLine.isDuet
    };
  });
}