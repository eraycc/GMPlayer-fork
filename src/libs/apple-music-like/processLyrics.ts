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

export interface LyricData {
  lyric: string;
}

export interface SongLyric {
  lrcAMData: LyricLine[];
  yrcAMData: LyricLine[];
  hasTTML?: boolean;    // 是否拥有TTML格式歌词
  ttml?: LyricLine[];   // TTML解析后的数据
  tlyric?: { lyric: string }; // LAAPI 提供的翻译歌词对象
  romalrc?: { lyric: string }; // LAAPI 提供的音译歌词对象
  // 兼容新版LAAPI格式
  translation?: string | { lyric: string }; // 新版LAAPI 提供的翻译歌词 (LRC格式)
  romaji?: string | { lyric: string };      // 新版LAAPI 提供的音译歌词 (LRC格式)
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

  // 预处理 - 解析LAAPI提供的翻译和音译LRC
  let translationMap: Map<number, string> = new Map();
  let romajiMap: Map<number, string> = new Map();
  
  // 尝试从不同来源获取翻译歌词
  let translationSource: string | undefined;
  
  if (settings.showTransl) {
    // 处理不同格式的翻译歌词
    if (songLyric.tlyric && songLyric.tlyric.lyric) {
      // NCM API格式
      translationSource = songLyric.tlyric.lyric;
      console.log('[createLyricsProcessor] 使用tlyric来源的翻译歌词');
    } 
    else if (songLyric.translation) {
      // 新版LAAPI格式，可能是字符串或对象
      if (typeof songLyric.translation === 'string') {
        translationSource = songLyric.translation;
        console.log('[createLyricsProcessor] 使用translation(字符串)来源的翻译歌词');
      }
      else if (typeof songLyric.translation === 'object' && songLyric.translation.lyric) {
        translationSource = songLyric.translation.lyric;
        console.log('[createLyricsProcessor] 使用translation(对象)来源的翻译歌词');
      }
    }
    
    // 解析翻译歌词
    if (translationSource) {
      const translLines = translationSource.split('\n');
      translLines.forEach(line => {
        const match = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)/);
        if (match) {
          const min = parseInt(match[1]);
          const sec = parseInt(match[2]);
          const ms = parseInt(match[3]);
          const timeMs = min * 60000 + sec * 1000 + ms * 10; // LRC时间格式转毫秒
          const text = match[4].trim();
          if (text) {
            translationMap.set(timeMs, text);
          }
        }
      });
      console.log(`[createLyricsProcessor] 解析翻译歌词完成，共${translationMap.size}行`);
    }
  }
  
  // 尝试从不同来源获取音译歌词
  let romajiSource: string | undefined;
  
  if (settings.showRoma) {
    // 处理不同格式的音译歌词
    if (songLyric.romalrc && songLyric.romalrc.lyric) {
      // NCM API格式
      romajiSource = songLyric.romalrc.lyric;
      console.log('[createLyricsProcessor] 使用romalrc来源的音译歌词');
    } 
    else if (songLyric.romaji) {
      // 新版LAAPI格式，可能是字符串或对象
      if (typeof songLyric.romaji === 'string') {
        romajiSource = songLyric.romaji;
        console.log('[createLyricsProcessor] 使用romaji(字符串)来源的音译歌词');
      }
      else if (typeof songLyric.romaji === 'object' && songLyric.romaji.lyric) {
        romajiSource = songLyric.romaji.lyric;
        console.log('[createLyricsProcessor] 使用romaji(对象)来源的音译歌词');
      }
    }
    
    // 解析音译歌词
    if (romajiSource) {
      const romaLines = romajiSource.split('\n');
      romaLines.forEach(line => {
        const match = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)/);
        if (match) {
          const min = parseInt(match[1]);
          const sec = parseInt(match[2]);
          const ms = parseInt(match[3]);
          const timeMs = min * 60000 + sec * 1000 + ms * 10; // LRC时间格式转毫秒
          const text = match[4].trim();
          if (text) {
            romajiMap.set(timeMs, text);
          }
        }
      });
      console.log(`[createLyricsProcessor] 解析音译歌词完成，共${romajiMap.size}行`);
    }
  }

  // 预处理检查 - 确认所有行都有有效的翻译和音译
  let hasInvalidTransl = false;
  let hasInvalidRoma = false;
  
  if (settings.showTransl || settings.showRoma) {
    // 检查所有行的翻译和音译是否有效
    rawLyrics.forEach((line, idx) => {
      const rawLine = toRaw(line);
      if (settings.showTransl && (!rawLine.translatedLyric || rawLine.translatedLyric.trim() === '')) {
        hasInvalidTransl = true;
        if (idx % 10 === 0) console.log(`[createLyricsProcessor] 第${idx}行缺少翻译`);
      }
      if (settings.showRoma && (!rawLine.romanLyric || rawLine.romanLyric.trim() === '')) {
        hasInvalidRoma = true;
        if (idx % 10 === 0) console.log(`[createLyricsProcessor] 第${idx}行缺少音译`);
      }
    });
    
    if (hasInvalidTransl) {
      console.log('[createLyricsProcessor] 检测到部分行缺少翻译，需要进行修复');
    }
    if (hasInvalidRoma) {
      console.log('[createLyricsProcessor] 检测到部分行缺少音译，需要进行修复');
    }
  }

  return rawLyrics.map((line: LyricLine, lineIndex: number) => {
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
    
    const processedWords = toRaw(rawLine.words || []).reduce<LyricWord[]>((acc, word, index, array) => {
      if (!word) return acc;
      
      // 添加当前单词，去除两端空格
      acc.push({
        startTime: word.startTime,
        endTime: word.endTime,
        word: word.word?.trim() || ""
      });
      
      // 如果不是最后一个单词，考虑添加空格
      if (index < array.length - 1 && array[index + 1]) {
        const currentWord = word.word?.trim() || "";
        const nextWord = array[index + 1].word?.trim() || "";
        
        // 判断条件：
        // 1. 当前词和下一个词都不是特殊字符本身
        // 2. 当前词不以特殊字符结尾，下一个词不以特殊字符开头
        // 3. 当前词和下一个词都不包含中文
        if (currentWord && nextWord &&
            !specialChars.has(currentWord) && 
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
    
    // 确保在非TTML模式下翻译和音译的时间轴与主歌词保持一致
    let translatedLyric = "";
    let romanLyric = "";

    // 获取当前行的开始时间，用于匹配LAAPI提供的LRC
    const currentStartTime = rawLine.startTime || (processedWords.length > 0 ? processedWords[0].startTime : 0);
    
    // 尝试从LAAPI的翻译/音译LRC中查找最接近的匹配，容忍度增加到3秒
    const TIME_TOLERANCE = 3000; // 3秒容忍度
    
    if (settings.showTransl && translationMap.size > 0) {
      // 首先尝试精确匹配
      if (translationMap.has(currentStartTime)) {
        translatedLyric = translationMap.get(currentStartTime) || "";
        console.log(`[createLyricsProcessor] 精确匹配 - 第${lineIndex}行翻译: "${translatedLyric.substring(0, 15)}..."`);
      } else {
        // 查找时间差最小的翻译
        let possibleMatches: {time: number, text: string, diff: number}[] = [];
        
        for (const [time, text] of translationMap.entries()) {
          const diff = Math.abs(time - currentStartTime);
          if (diff < TIME_TOLERANCE) {
            possibleMatches.push({time, text, diff});
          }
        }
        
        // 如果找到匹配项，使用时间差最小的
        if (possibleMatches.length > 0) {
          // 按时间差排序
          possibleMatches.sort((a, b) => a.diff - b.diff);
          translatedLyric = possibleMatches[0].text;
          if (lineIndex % 10 === 0) {
            console.log(`[createLyricsProcessor] 最佳匹配 - 第${lineIndex}行翻译，时间差${possibleMatches[0].diff}ms: "${translatedLyric.substring(0, 15)}..."`);
          }
        }
      }
    }
    
    if (settings.showRoma && romajiMap.size > 0) {
      // 首先尝试精确匹配
      if (romajiMap.has(currentStartTime)) {
        romanLyric = romajiMap.get(currentStartTime) || "";
        console.log(`[createLyricsProcessor] 精确匹配 - 第${lineIndex}行音译: "${romanLyric.substring(0, 15)}..."`);
      } else {
        // 查找时间差最小的音译
        let possibleMatches: {time: number, text: string, diff: number}[] = [];
        
        for (const [time, text] of romajiMap.entries()) {
          const diff = Math.abs(time - currentStartTime);
          if (diff < TIME_TOLERANCE) {
            possibleMatches.push({time, text, diff});
          }
        }
        
        // 如果找到匹配项，使用时间差最小的
        if (possibleMatches.length > 0) {
          // 按时间差排序
          possibleMatches.sort((a, b) => a.diff - b.diff);
          romanLyric = possibleMatches[0].text;
          if (lineIndex % 10 === 0) {
            console.log(`[createLyricsProcessor] 最佳匹配 - 第${lineIndex}行音译，时间差${possibleMatches[0].diff}ms: "${romanLyric.substring(0, 15)}..."`);
          }
        }
      }
    }
    
    // 如果从LAAPI获取不到，再使用现有的翻译和音译
    if (!translatedLyric && rawLine.translatedLyric) {
      translatedLyric = rawLine.translatedLyric;
    }
    
    if (!romanLyric && rawLine.romanLyric) {
      romanLyric = rawLine.romanLyric;
    }
    
    // 如果仍然缺少翻译或音译，尝试从其他行寻找匹配
    if ((settings.showTransl && !translatedLyric && hasInvalidTransl) || 
        (settings.showRoma && !romanLyric && hasInvalidRoma)) {
      
      // 从全部行中寻找最接近的行
      for (let i = 0; i < rawLyrics.length; i++) {
        if (i === lineIndex) continue; // 跳过当前行
        
        const otherLine = toRaw(rawLyrics[i]);
        const otherWords = toRaw(otherLine.words || []);
        if (!otherWords.length) continue;
        
        const otherStartTime = otherLine.startTime || otherWords[0].startTime;
        const timeDiff = Math.abs(currentStartTime - otherStartTime);
        
        // 如果时间差在5秒内，考虑使用这一行的翻译或音译
        if (timeDiff < 5000) {
          if (settings.showTransl && !translatedLyric && otherLine.translatedLyric) {
            translatedLyric = otherLine.translatedLyric;
            console.log(`[createLyricsProcessor] 第${lineIndex}行使用了第${i}行的翻译，时间差: ${timeDiff}ms`);
          }
          
          if (settings.showRoma && !romanLyric && otherLine.romanLyric) {
            romanLyric = otherLine.romanLyric;
            console.log(`[createLyricsProcessor] 第${lineIndex}行使用了第${i}行的音译，时间差: ${timeDiff}ms`);
          }
          
          // 如果已经找到了翻译和音译，就不需要继续查找了
          if ((!settings.showTransl || translatedLyric) && (!settings.showRoma || romanLyric)) {
            break;
          }
        }
      }
    }

    // 确保所有单词都有有效的时间戳
    if (processedWords.length > 0) {
      const validStartTime = processedWords[0].startTime || 0;
      const validEndTime = processedWords[processedWords.length - 1].endTime || (validStartTime + 5000);
      
      // 确保整行歌词的开始和结束时间有效
      return {
        startTime: rawLine.startTime || validStartTime,
        endTime: rawLine.endTime || validEndTime,
        words: processedWords,
        translatedLyric: translatedLyric,
        romanLyric: romanLyric,
        isBG: rawLine.isBG || false,
        isDuet: rawLine.isDuet || false
      };
    }
    
    return {
      startTime: rawLine.startTime || 0,
      endTime: rawLine.endTime || 0,
      words: processedWords,
      translatedLyric: translatedLyric,
      romanLyric: romanLyric,
      isBG: rawLine.isBG || false,
      isDuet: rawLine.isDuet || false
    };
  });
}