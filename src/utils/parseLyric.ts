import { parseLrc as parseCoreLrc, parseYrc as parseCoreYrc } from "@applemusic-like-lyrics/lyric";
import { msToS, msToTime } from "./timeTools";
import { musicStore } from "../store";

interface LyricWord {
  word: string;
  startTime: number;
  endTime: number;
}

interface LyricLine {
  words: LyricWord[];
  isBG?: boolean;
  isDuet?: boolean;
}

interface ParsedLyricLine {
  time: number;
  content: string;
  tran?: string;
  roma?: string;
}

interface YrcLine {
  time: number;
  endTime: number;
  content: {
    time: number;
    endTime: number;
    duration: number;
    content: string;
    endsWithSpace: boolean;
  }[];
  TextContent: string;
}

interface LyricData {
  lrc?: { lyric: string } | null;
  tlyric?: { lyric: string } | null;
  romalrc?: { lyric: string } | null;
  yrc?: { lyric: string } | null;
  ytlrc?: { lyric: string } | null;
  yromalrc?: { lyric: string } | null;
  code?: number;
}

interface ParsedLyricResult {
  hasLrcTran: boolean;
  hasLrcRoma: boolean;
  hasYrc: boolean;
  hasYrcTran: boolean;
  hasYrcRoma: boolean;
  hasTTML: boolean;  // 是否拥有TTML格式歌词
  lrc: ParsedLyricLine[];
  yrc: YrcLine[];
  ttml: any[];       // parseTTML解析后的数据
  lrcAMData: any[];
  yrcAMData: any[];
}

// Creates the default empty state
const getDefaultLyricResult = (): ParsedLyricResult => ({
  hasLrcTran: false,
  hasLrcRoma: false,
  hasYrc: false,
  hasYrcTran: false,
  hasYrcRoma: false,
  hasTTML: false,    // 默认没有TTML歌词
  lrc: [],
  yrc: [],
  ttml: [],          // TTML歌词数据默认为空数组
  lrcAMData: [],
  yrcAMData: []
});

// 恢复默认 - Now uses the factory function
const resetSongLyric = (): void => {
  const music = musicStore();
  // 创建一个包含formattedLrc字段的完整歌词对象
  const defaultLyric = getDefaultLyricResult();
  // fuck TypeScript
  // @ts-nocheck
  music.songLyric = {
    lrc: defaultLyric.lrc,
    yrc: defaultLyric.yrc,
    lrcAMData: defaultLyric.lrcAMData,
    yrcAMData: defaultLyric.yrcAMData,
    hasTTML: defaultLyric.hasTTML,
    ttml: defaultLyric.ttml,
    hasLrcTran: defaultLyric.hasLrcTran,
    hasLrcRoma: defaultLyric.hasLrcRoma,
    hasYrc: defaultLyric.hasYrc,
    hasYrcTran: defaultLyric.hasYrcTran,
    hasYrcRoma: defaultLyric.hasYrcRoma,
    formattedLrc: "" // 添加musicStore中需要的字段
  };
};

/**
 * Parse lyric data from API response
 * @param {LyricData | null} data API response data or null on fetch error
 * @returns {ParsedLyricResult} Parsed lyric data (always returns a valid object)
 */
const parseLyric = (data: LyricData | null): ParsedLyricResult => {
  // Always return a valid default object on failure or invalid data
  if (!data || data.code !== 200) {
    // console.warn("[parseLyric] Invalid input data or error code.", data);
    return getDefaultLyricResult();
  }

  // Initialize result object using the default factory
  const result: ParsedLyricResult = getDefaultLyricResult();

  try {
    const { lrc, tlyric, romalrc, yrc, ytlrc, yromalrc } = data;
    const lrcData = {
      lrc: lrc?.lyric || null,
      tlyric: tlyric?.lyric || null,
      romalrc: romalrc?.lyric || null,
      yrc: yrc?.lyric || null,
      ytlrc: ytlrc?.lyric || null,
      yromalrc: yromalrc?.lyric || null
    };

    // Update flags based on actual data received
    result.hasLrcTran = !!lrcData.tlyric;
    result.hasLrcRoma = !!lrcData.romalrc;
    result.hasYrc = !!lrcData.yrc;
    result.hasYrcTran = !!lrcData.ytlrc;
    result.hasYrcRoma = !!lrcData.yromalrc;

    // Parse normal lyrics
    if (lrcData.lrc) {
      const lrcParsed = parseCoreLrc(lrcData.lrc);
      result.lrc = parseLrcData(lrcParsed);

      // Parse translations if they exist
      let tranParsed: LyricLine[] = [];
      let romaParsed: LyricLine[] = [];

      if (lrcData.tlyric) {
        tranParsed = parseCoreLrc(lrcData.tlyric);
        result.lrc = alignLyrics(result.lrc, parseLrcData(tranParsed), "tran");
      }
      if (lrcData.romalrc) {
        romaParsed = parseCoreLrc(lrcData.romalrc);
        result.lrc = alignLyrics(result.lrc, parseLrcData(romaParsed), "roma");
      }

      // Generate AM format data for LRC
      result.lrcAMData = parseAMData(lrcParsed, tranParsed, romaParsed);
    }

    // Parse YRC lyrics or handle pre-parsed TTML lyrics
    if (lrcData.yrc) {
      let yrcParsed: LyricLine[] = [];
      
      // 检查是否是预解析的TTML歌词数据
      if (lrcData.yrc.startsWith('___PARSED_LYRIC_LINES___')) {
        try {
          // 提取JSON字符串部分并解析回LyricLine[]
          const jsonPart = lrcData.yrc.substring('___PARSED_LYRIC_LINES___'.length);
          yrcParsed = JSON.parse(jsonPart) as LyricLine[];
          console.log('[parseLyric] Successfully parsed pre-parsed TTML data', yrcParsed.length);
          
          // 设置TTML相关字段
          result.hasTTML = true;
          result.ttml = yrcParsed;
        } catch (error) {
          console.error('[parseLyric] Failed to parse pre-parsed TTML data:', error);
          // 解析失败，使用默认空数组
          yrcParsed = [];
        }
      } else {
        // 常规处理：解析QRC/YRC格式
        yrcParsed = parseCoreYrc(lrcData.yrc);
      }
      
      // 继续处理解析后的lyric数据
      result.yrc = parseYrcData(yrcParsed);

      // Parse translations if they exist
      let tranParsed: LyricLine[] = [];
      let romaParsed: LyricLine[] = [];

      if (lrcData.ytlrc) {
        tranParsed = parseCoreLrc(lrcData.ytlrc);
        result.yrc = alignLyrics(result.yrc, parseLrcData(tranParsed), "tran");
      }
      if (lrcData.yromalrc) {
        romaParsed = parseCoreLrc(lrcData.yromalrc);
        result.yrc = alignLyrics(result.yrc, parseLrcData(romaParsed), "roma");
      }

      // Generate AM format data for YRC
      result.yrcAMData = parseAMData(yrcParsed, tranParsed, romaParsed);
      
      // 确保在只有YRC数据时也创建LRC数据
      // 如果没有LRC数据但有YRC数据，从YRC数据生成LRC数据
      if ((!result.lrc || result.lrc.length === 0) && result.yrc && result.yrc.length > 0) {
        console.log('[parseLyric] Generating LRC data from YRC data');
        
        // 从YRC数据创建LRC数据
        result.lrc = result.yrc.map(yrcLine => {
          return {
            time: yrcLine.time,
            content: yrcLine.TextContent
          };
        });
        
        // 生成AM格式的LRC数据
        if (yrcParsed.length > 0) {
          // 如果yrcParsed存在，使用它来生成lrcAMData
          result.lrcAMData = parseAMData(yrcParsed, tranParsed, romaParsed);
        } else if (result.lrc.length > 0) {
          // 否则，基于生成的lrc数据创建简单的LyricLine[]
          const simpleLrcLines: LyricLine[] = result.lrc.map(line => ({
            words: [{
              word: line.content,
              startTime: line.time * 1000,
              endTime: (line.time + 5) * 1000 // 假设每行持续5秒
            }]
          }));
          result.lrcAMData = parseAMData(simpleLrcLines, [], []);
        }
      }
    }

  } catch (error) {
      console.error("[parseLyric] Error during lyric parsing:", error);
      // Return default object on parsing error
      return getDefaultLyricResult();
  }
  
  // 最终检查：如果没有lrc数据但有yrc数据，为了安全起见再次确认lrc数据存在
  if ((!result.lrc || result.lrc.length === 0) && result.yrc && result.yrc.length > 0) {
    console.log('[parseLyric] 最终检查：创建基本的lrc数据');
    
    // 创建基本的lrc格式歌词
    result.lrc = result.yrc.map(yrcLine => {
      return {
        time: yrcLine.time,
        content: yrcLine.TextContent
      };
    });
  }
  
  // 确保即使在数据生成可能失败的情况下也有基本的占位歌词
  if (!result.lrc || result.lrc.length === 0) {
    console.log('[parseLyric] 没有可用的歌词数据，创建占位歌词');
    result.lrc = [
      { time: 0, content: "暂无歌词" },
      { time: 999, content: "No Lyrics Available" }
    ];
  }

  return result;
};

/**
 * Parse normal LRC lyrics
 * @param {LyricLine[]} lrcData Array of LyricLine objects
 * @returns {ParsedLyricLine[]} Parsed lyric data
 */
const parseLrcData = (lrcData: LyricLine[]): ParsedLyricLine[] => {
  if (!lrcData) return [];

  return lrcData
    .map(line => {
      const words = line.words;
      const time = msToS(words[0].startTime);
      const content = words[0].word.trim();

      if (!content) return null;

      return {
        time,
        content
      };
    })
    .filter((line): line is ParsedLyricLine => line !== null);
};

/**
 * Parse YRC (word-by-word) lyrics
 * @param {LyricLine[]} yrcData Array of LyricLine objects
 * @returns {YrcLine[]} Parsed YRC data
 */
const parseYrcData = (yrcData: LyricLine[]): YrcLine[] => {
  if (!yrcData) return [];

  return yrcData
    .map(line => {
      const words = line.words;
      const time = msToS(words[0].startTime);
      const endTime = msToS(words[words.length - 1].endTime);

      const content = words.map(word => ({
        time: msToS(word.startTime),
        endTime: msToS(word.endTime),
        duration: msToS(word.endTime - word.startTime),
        content: word.word.endsWith(" ") ? word.word : word.word.trim(),
        endsWithSpace: word.word.endsWith(" ")
      }));

      const contentStr = content
        .map(word => word.content)
        .join("");

      if (!contentStr) return null;

      return {
        time,
        endTime,
        content,
        TextContent: contentStr
      };
    })
    .filter((line): line is YrcLine => line !== null);
};

/**
 * Align lyrics with translations
 * @param {(ParsedLyricLine[] | YrcLine[])} lyrics Main lyrics array
 * @param {ParsedLyricLine[]} otherLyrics Translation lyrics array
 * @param {string} key Property key for translation ('tran' or 'roma')
 * @returns {(ParsedLyricLine[] | YrcLine[])} Aligned lyrics array
 */
const alignLyrics = <T extends ParsedLyricLine | YrcLine>(
  lyrics: T[],
  otherLyrics: ParsedLyricLine[],
  key: 'tran' | 'roma'
): T[] => {
  if (lyrics.length && otherLyrics.length) {
    lyrics.forEach(mainLine => {
      otherLyrics.forEach(transLine => {
        if (mainLine.time === transLine.time || Math.abs(mainLine.time - transLine.time) < 0.6) {
          (mainLine as any)[key] = transLine.content;
        }
      });
    });
  }
  return lyrics;
};

/**
 * Parse lyrics for Apple Music like format
 * @param {LyricLine[]} lrcData Main lyrics array
 * @param {LyricLine[]} tranData Translation lyrics array
 * @param {LyricLine[]} romaData Romanization lyrics array
 * @returns {any[]} Formatted lyrics array
 */
const parseAMData = (
  lrcData: LyricLine[],
  tranData: LyricLine[] = [],
  romaData: LyricLine[] = []
): any[] => {
  return lrcData.map((line, index, lines) => ({
    words: line.words,
    startTime: line.words[0]?.startTime ?? 0,
    endTime: lines[index + 1]?.words?.[0]?.startTime ??
             line.words?.[line.words.length - 1]?.endTime ??
             Infinity,
    translatedLyric: tranData?.[index]?.words?.[0]?.word ?? "",
    romanLyric: romaData?.[index]?.words?.[0]?.word ?? "",
    isBG: line.isBG ?? false,
    isDuet: line.isDuet ?? false,
  }));
};

/**
 * 将解析后的歌词数据转换为标准LRC格式文本
 * @param {ParsedLyricResult} parsedLyric 解析后的歌词结果对象
 * @returns {string} 标准LRC格式文本
 */
const formatToLrc = (parsedLyric: ParsedLyricResult): string => {
  if (!parsedLyric || !parsedLyric.lrc || parsedLyric.lrc.length === 0) {
    return '';
  }
  
  // 标题、作者等元数据（可选，如果有数据的话）
  let lrcText = '';
  
  // 转换每一行歌词
  parsedLyric.lrc.forEach(line => {
    // 将秒转换为分:秒格式 (00:00.00)
    const minutes = Math.floor(line.time / 60);
    const seconds = (line.time % 60).toFixed(2);
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.padStart(5, '0')}`;
    
    // 添加主歌词行
    lrcText += `[${timeStr}]${line.content}\n`;
    
    // 如果有翻译，添加翻译行
    if (parsedLyric.hasLrcTran && line.tran) {
      lrcText += `[${timeStr}]${line.tran}\n`;
    }
    
    // 如果有罗马音，添加罗马音行
    if (parsedLyric.hasLrcRoma && line.roma) {
      lrcText += `[${timeStr}]${line.roma}\n`;
    }
  });
  
  return lrcText;
};

export {
  parseLyric,
  parseLrcData,
  parseYrcData,
  alignLyrics,
  parseAMData,
  resetSongLyric,
  formatToLrc
};

export default parseLyric;