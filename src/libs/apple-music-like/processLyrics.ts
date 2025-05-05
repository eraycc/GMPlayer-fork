import { toRaw } from 'vue';
import type { ComputedRef } from 'vue';
import type { Store } from 'pinia';

/**
 * 歌词单词接口
 */
export interface LyricWord {
  word: string;
  startTime: number;
  endTime: number;
}

/**
 * 歌词行接口
 */
export interface LyricLine {
  startTime: number;
  endTime: number;
  words: LyricWord[];
  translatedLyric: string;
  romanLyric: string;
  isBG: boolean;
  isDuet: boolean;
}

/**
 * 歌词数据接口
 */
export interface LyricData {
  lyric: string;
}

/**
 * 歌曲歌词接口
 */
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
  // 添加预处理后的缓存
  processedLyrics?: LyricLine[];
  // 处理设置的哈希值，用于检测设置是否变更
  settingsHash?: string;
}

/**
 * 设置状态接口
 */
export interface SettingState {
  showYrc: boolean;
  showRoma: boolean;
  showTransl: boolean;
}

/**
 * 生成设置状态的哈希值，用于判断设置是否变更
 * @param settings 设置状态
 * @returns 设置状态的哈希值
 */
function generateSettingsHash(settings: SettingState): string {
  return `${settings.showYrc}-${settings.showRoma}-${settings.showTransl}`;
}

/**
 * 转换LRC格式文本为时间映射
 * @param lrcText LRC格式文本
 * @returns 时间到文本的映射
 */
function parseLrcToTimeMap(lrcText: string): Map<number, string> {
  const timeMap = new Map<number, string>();
  if (!lrcText) return timeMap;
  
  const lines = lrcText.split('\n');
  lines.forEach(line => {
    const match = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)/);
    if (match) {
      const min = parseInt(match[1]);
      const sec = parseInt(match[2]);
      const ms = parseInt(match[3]);
      const timeMs = min * 60000 + sec * 1000 + ms * 10; // LRC时间格式转毫秒
      const text = match[4].trim();
      if (text) {
        timeMap.set(timeMs, text);
      }
    }
  });
  
  return timeMap;
}

/**
 * 查找最接近的时间戳匹配
 * @param targetTime 目标时间
 * @param timeMap 时间映射
 * @param tolerance 容差范围
 * @returns 匹配的文本
 */
function findBestTimeMatch(targetTime: number, timeMap: Map<number, string>, tolerance: number = 3000): string {
  // 首先尝试精确匹配
  if (timeMap.has(targetTime)) {
    return timeMap.get(targetTime) || "";
  }
  
  // 查找时间差最小的匹配
  let closestMatch = "";
  let minDiff = tolerance;
  
  for (const [time, text] of timeMap.entries()) {
    const diff = Math.abs(time - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      closestMatch = text;
    }
  }
  
  return closestMatch;
}

/**
 * 预处理和缓存歌词数据，在获取歌词时提前处理以提高性能
 * @param songLyric 歌曲歌词
 * @param settings 设置状态
 */
export function preprocessLyrics(songLyric: SongLyric, settings: SettingState): void {
  // 生成当前设置的哈希值
  const currentHash = generateSettingsHash(settings);
  
  // 如果已经预处理过且设置没变，直接返回
  if (songLyric.processedLyrics && 
      songLyric.processedLyrics.length > 0 &&
      songLyric.settingsHash === currentHash) {
    console.log('[preprocessLyrics] 使用缓存的预处理歌词数据');
    return;
  }
  
  console.log('[preprocessLyrics] 开始预处理歌词数据');
  const startTime = performance.now();
  
  // 缓存处理后的歌词结果
  songLyric.processedLyrics = createLyricsProcessor(songLyric, settings);
  // 保存设置哈希值，用于检测设置是否变更
  songLyric.settingsHash = currentHash;
  
  const endTime = performance.now();
  console.log(`[preprocessLyrics] 预处理完成，耗时: ${(endTime - startTime).toFixed(2)}ms，行数: ${songLyric.processedLyrics.length}`);
}

/**
 * 处理歌词数据
 * @param songLyric 歌曲歌词
 * @param settings 设置状态
 * @returns 处理后的歌词行数组
 */
export function createLyricsProcessor(songLyric: SongLyric, settings: SettingState): LyricLine[] {
  // 优先级顺序：TTML > YRC > LRC
  let rawLyrics: LyricLine[] = [];

  // 选择合适的歌词源
  if (songLyric.hasTTML && songLyric.ttml && songLyric.ttml.length > 0) {
    console.log('[createLyricsProcessor] 使用TTML格式歌词');
    rawLyrics = toRaw(songLyric.ttml);
  }
  else if (settings.showYrc && songLyric.yrcAMData?.length) {
    console.log('[createLyricsProcessor] 使用YRC格式歌词');
    rawLyrics = toRaw(songLyric.yrcAMData);
  }
  else {
    console.log('[createLyricsProcessor] 使用LRC格式歌词');
    rawLyrics = toRaw(songLyric.lrcAMData) || [];
  }

  // 预处理 - 解析LAAPI提供的翻译和音译LRC，使用预先处理的映射提高效率
  let translationMap: Map<number, string> = new Map();
  let romajiMap: Map<number, string> = new Map();
  
  // 提前解析翻译和音译数据到映射表，只解析一次
  if (settings.showTransl) {
    // 处理不同格式的翻译歌词
    let translationSource: string | undefined;
    
    if (songLyric.tlyric && songLyric.tlyric.lyric) {
      // NCM API格式
      translationSource = songLyric.tlyric.lyric;
    } 
    else if (songLyric.translation) {
      // 新版LAAPI格式，可能是字符串或对象
      if (typeof songLyric.translation === 'string') {
        translationSource = songLyric.translation;
      }
      else if (typeof songLyric.translation === 'object' && songLyric.translation.lyric) {
        translationSource = songLyric.translation.lyric;
      }
    }
    
    // 解析翻译歌词到映射表
    if (translationSource) {
      translationMap = parseLrcToTimeMap(translationSource);
      console.log(`[createLyricsProcessor] 解析翻译歌词完成，共${translationMap.size}行`);
    }
  }
  
  if (settings.showRoma) {
    // 处理不同格式的音译歌词
    let romajiSource: string | undefined;
    
    if (songLyric.romalrc && songLyric.romalrc.lyric) {
      // NCM API格式
      romajiSource = songLyric.romalrc.lyric;
    } 
    else if (songLyric.romaji) {
      // 新版LAAPI格式，可能是字符串或对象
      if (typeof songLyric.romaji === 'string') {
        romajiSource = songLyric.romaji;
      }
      else if (typeof songLyric.romaji === 'object' && songLyric.romaji.lyric) {
        romajiSource = songLyric.romaji.lyric;
      }
    }
    
    // 解析音译歌词到映射表
    if (romajiSource) {
      romajiMap = parseLrcToTimeMap(romajiSource);
      console.log(`[createLyricsProcessor] 解析音译歌词完成，共${romajiMap.size}行`);
    }
  }

  // 优化批量处理 - 减少循环和条件判断
  return rawLyrics.map((line: LyricLine, lineIndex: number) => {
    const rawLine = toRaw(line);
    
    // 处理单词间的空格逻辑
    const processedWords = processWords(rawLine.words || []);
    
    // 获取当前行的开始时间，用于匹配翻译/音译
    const currentStartTime = rawLine.startTime || (processedWords.length > 0 ? processedWords[0].startTime : 0);
    
    // 初始化翻译和音译文本
    let translatedLyric = "";
    let romanLyric = "";
    
    // 高效查找翻译
    if (settings.showTransl && translationMap.size > 0) {
      translatedLyric = findBestTimeMatch(currentStartTime, translationMap);
    }
    
    // 高效查找音译
    if (settings.showRoma && romajiMap.size > 0) {
      romanLyric = findBestTimeMatch(currentStartTime, romajiMap);
    }
    
    // 如果从LAAPI获取不到，再使用现有的翻译和音译
    if (!translatedLyric && rawLine.translatedLyric) {
      translatedLyric = rawLine.translatedLyric;
    }
    
    if (!romanLyric && rawLine.romanLyric) {
      romanLyric = rawLine.romanLyric;
    }
    
    // 确保歌词行有有效的开始和结束时间
    let startTime = rawLine.startTime;
    let endTime = rawLine.endTime;
    
    if (processedWords.length > 0) {
      startTime = startTime || processedWords[0].startTime || 0;
      endTime = endTime || processedWords[processedWords.length - 1].endTime || (startTime + 5000);
    }
    
    // 返回处理后的歌词行对象
    return {
      startTime: startTime || 0,
      endTime: endTime || 0,
      words: processedWords,
      translatedLyric: translatedLyric,
      romanLyric: romanLyric,
      isBG: rawLine.isBG || false,
      isDuet: rawLine.isDuet || false
    };
  });
}

/**
 * 处理歌词单词，添加适当的空格
 * @param words 原始单词数组
 * @returns 处理后的单词数组
 */
function processWords(words: LyricWord[]): LyricWord[] {
  // 定义特殊字符集合，这些字符前后不应添加空格
  const specialChars = new Set(["'", "'", "'", "-", "…", ".", "'", "?", "'"]);
  
  // 用于检测中文字符的正则表达式，预编译提高效率
  const chineseRegex = /[\u4e00-\u9fa5]/;
  
  // 检测是否包含中文字符的函数
  const containsChinese = (text: string): boolean => {
    return chineseRegex.test(text);
  };

  // 检查字符串是否以特殊字符开头或结尾
  const hasSpecialCharAtBoundary = (text: string): boolean => {
    if (!text || text.length === 0) return false;
    const firstChar = text.charAt(0);
    const lastChar = text.charAt(text.length - 1);
    return specialChars.has(firstChar) || specialChars.has(lastChar);
  };
  
  // 优化单词处理循环，减少重复计算
  return toRaw(words).reduce<LyricWord[]>((acc, word, index, array) => {
    if (!word) return acc;
    
    const currentWord = word.word?.trim() || "";
    
    // 添加当前单词
    acc.push({
      startTime: word.startTime,
      endTime: word.endTime,
      word: currentWord
    });
    
    // 如果不是最后一个单词，考虑添加空格
    if (index < array.length - 1 && array[index + 1]) {
      const nextWord = array[index + 1].word?.trim() || "";
      
      // 使用短路逻辑减少计算量
      if (currentWord && nextWord &&
          !specialChars.has(currentWord) && 
          !specialChars.has(nextWord) && 
          !hasSpecialCharAtBoundary(currentWord) && 
          !hasSpecialCharAtBoundary(nextWord) &&
          !containsChinese(currentWord) && 
          !containsChinese(nextWord)) {
        acc.push({
          word: "\u00A0", // 不间断空格
          startTime: 0,
          endTime: 0
        });
      }
    }
    
    return acc;
  }, []);
}

/**
 * 获取处理后的歌词行，优先使用缓存
 * @param songLyric 歌曲歌词
 * @param settings 设置状态
 * @returns 处理后的歌词行数组
 */
export function getProcessedLyrics(songLyric: SongLyric, settings: SettingState): LyricLine[] {
  // 生成当前设置的哈希值
  const currentHash = generateSettingsHash(settings);
  
  // 如果有缓存且设置未变，直接返回缓存
  if (songLyric.processedLyrics && 
      songLyric.processedLyrics.length > 0 && 
      songLyric.settingsHash === currentHash) {
    console.log('[getProcessedLyrics] 使用缓存的歌词数据');
    return songLyric.processedLyrics;
  }
  
  // 否则，重新处理并更新缓存
  console.log('[getProcessedLyrics] 缓存未命中，重新处理歌词');
  songLyric.processedLyrics = createLyricsProcessor(songLyric, settings);
  songLyric.settingsHash = currentHash;
  
  return songLyric.processedLyrics;
}