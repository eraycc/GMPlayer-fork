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
  tran?: string;
  roma?: string;
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
  formattedLrc?: string; // 可选字段，格式化后的LRC文本
}

// Creates the default empty state
const getDefaultLyricResult = (): ParsedLyricResult => ({
  hasLrcTran: false,
  hasLrcRoma: false,
  hasYrc: false,
  hasYrcTran: false,
  hasYrcRoma: false,
  hasTTML: false,    // 默认没有TTML歌词
  lrc: [] as ParsedLyricLine[],
  yrc: [] as YrcLine[],
  ttml: [] as any[],          // TTML歌词数据默认为空数组
  lrcAMData: [] as any[],
  yrcAMData: [] as any[]
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

  console.log("[parseLyric] 开始解析歌词数据");
  
  // 检查是否包含LAAPI新格式数据
  if ((data as any).translation) {
    console.log("[parseLyric] 检测到LAAPI新格式翻译数据 (translation)");
    if (typeof (data as any).translation === 'string') {
      console.log("[parseLyric] translation格式: 字符串");
    } else if (typeof (data as any).translation === 'object') {
      console.log("[parseLyric] translation格式: 对象");
    }
  }
  if ((data as any).romaji) {
    console.log("[parseLyric] 检测到LAAPI新格式音译数据 (romaji)");
    if (typeof (data as any).romaji === 'string') {
      console.log("[parseLyric] romaji格式: 字符串");
    } else if (typeof (data as any).romaji === 'object') {
      console.log("[parseLyric] romaji格式: 对象");
    }
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

    // Log the available lyric data
    console.log(`[parseLyric] 数据完整性检查:
      - lrc: ${lrcData.lrc ? '✓' : '✗'}
      - tlyric: ${lrcData.tlyric ? '✓' : '✗'}
      - romalrc: ${lrcData.romalrc ? '✓' : '✗'}
      - yrc: ${lrcData.yrc ? '✓' : '✗'}
      - ytlrc: ${lrcData.ytlrc ? '✓' : '✗'}
      - yromalrc: ${lrcData.yromalrc ? '✓' : '✗'}`
    );

    // Update flags based on actual data received
    result.hasLrcTran = !!lrcData.tlyric;
    result.hasLrcRoma = !!lrcData.romalrc;
    result.hasYrc = !!lrcData.yrc;
    result.hasYrcTran = !!lrcData.ytlrc;
    result.hasYrcRoma = !!lrcData.yromalrc;

    console.log(`[parseLyric] 标志设置:
      - hasLrcTran: ${result.hasLrcTran}
      - hasLrcRoma: ${result.hasLrcRoma}
      - hasYrc: ${result.hasYrc}
      - hasYrcTran: ${result.hasYrcTran}
      - hasYrcRoma: ${result.hasYrcRoma}`
    );

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

      // 处理标准LRC格式的翻译
      // 优先使用专用YRC翻译，如果没有则尝试使用标准翻译
      if (lrcData.ytlrc) {
        console.log('[parseLyric] 使用逐字翻译歌词(ytlrc)');
        tranParsed = parseCoreLrc(lrcData.ytlrc);
        try {
          result.yrc = alignLyrics(result.yrc, parseLrcData(tranParsed), "tran");
        } catch (error) {
          console.warn('[parseLyric] 对齐逐字翻译歌词失败，尝试使用备用方法:', error);
          // 如果对齐失败，尝试简单地附加翻译到每行
          if (result.yrc && result.yrc.length > 0 && tranParsed.length > 0) {
            // 确保翻译行数与原歌词行数匹配
            const minLength = Math.min(result.yrc.length, parseLrcData(tranParsed).length);
            for (let i = 0; i < minLength; i++) {
              result.yrc[i].tran = parseLrcData(tranParsed)[i].content;
            }
          }
        }
      } 
      // 如果没有ytlrc但有tlyric，使用tlyric作为YRC的翻译
      else if (lrcData.tlyric) {
        console.log('[parseLyric] 没有找到逐字翻译(ytlrc)，尝试使用普通翻译(tlyric)');
        tranParsed = parseCoreLrc(lrcData.tlyric);
        try {
          // 先对齐到YRC
          result.yrc = alignLyrics(result.yrc, parseLrcData(tranParsed), "tran");
        } catch (error) {
          console.warn('[parseLyric] 使用tlyric对齐到YRC失败:', error);
        }
      }

      // 处理标准LRC格式的音译
      // 优先使用专用YRC音译，如果没有则尝试使用标准音译
      if (lrcData.yromalrc) {
        console.log('[parseLyric] 处理逐字音译歌词(yromalrc)');
        romaParsed = parseCoreLrc(lrcData.yromalrc);
        try {
          result.yrc = alignLyrics(result.yrc, parseLrcData(romaParsed), "roma");
        } catch (error) {
          console.warn('[parseLyric] 对齐逐字音译歌词失败，尝试使用备用方法:', error);
          // 如果对齐失败，尝试简单地附加音译到每行
          if (result.yrc && result.yrc.length > 0 && romaParsed.length > 0) {
            // 确保音译行数与原歌词行数匹配
            const minLength = Math.min(result.yrc.length, parseLrcData(romaParsed).length);
            for (let i = 0; i < minLength; i++) {
              result.yrc[i].roma = parseLrcData(romaParsed)[i].content;
            }
          }
        }
      } 
      // 如果没有yromalrc但有romalrc，使用romalrc作为YRC的音译
      else if (lrcData.romalrc) {
        console.log('[parseLyric] 没有找到逐字音译(yromalrc)，尝试使用普通音译(romalrc)');
        romaParsed = parseCoreLrc(lrcData.romalrc);
        try {
          // 先对齐到YRC
          result.yrc = alignLyrics(result.yrc, parseLrcData(romaParsed), "roma");
        } catch (error) {
          console.warn('[parseLyric] 使用romalrc对齐到YRC失败:', error);
        }
      }

      // 从YRC到yrcAMData的翻译和音译迁移
      // 确保YRC中的翻译和音译数据可以传递到yrcAMData
      const yrcTransData: LyricLine[] = [];
      const yrcRomaData: LyricLine[] = [];
      
      // 从YRC提取翻译和音译数据
      if (result.yrc && result.yrc.length > 0) {
        console.log('[parseLyric] 从YRC提取翻译和音译数据用于生成yrcAMData');
        
        result.yrc.forEach((line, index) => {
          if (line.tran) {
            yrcTransData.push({
              words: [{
                word: line.tran,
                startTime: line.time * 1000, // 转回毫秒
                endTime: line.endTime * 1000
              }]
            });
            if (index % 10 === 0) {
              console.log(`[parseLyric] 提取YRC翻译 #${index}: "${line.tran.substring(0, 15)}..."`);
            }
          }
          
          if (line.roma) {
            yrcRomaData.push({
              words: [{
                word: line.roma,
                startTime: line.time * 1000, // 转回毫秒
                endTime: line.endTime * 1000
              }]
            });
            if (index % 10 === 0) {
              console.log(`[parseLyric] 提取YRC音译 #${index}: "${line.roma.substring(0, 15)}..."`);
            }
          }
        });
        
        console.log(`[parseLyric] 提取完成: 翻译${yrcTransData.length}行, 音译${yrcRomaData.length}行`);
      }
      
      // 生成AM格式数据时，优先使用从YRC提取的翻译和音译数据
      if (yrcTransData.length > 0 || yrcRomaData.length > 0) {
        console.log('[parseLyric] 使用从YRC提取的翻译和音译数据生成yrcAMData');
        result.yrcAMData = parseAMData(yrcParsed, 
          yrcTransData.length > 0 ? yrcTransData : tranParsed, 
          yrcRomaData.length > 0 ? yrcRomaData : romaParsed);
      } else {
        // 否则使用原始的翻译和音译数据
        console.log('[parseLyric] 使用原始翻译和音译数据生成yrcAMData');
        result.yrcAMData = parseAMData(yrcParsed, tranParsed, romaParsed);
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
  if (!lyrics.length || !otherLyrics.length) {
    return lyrics;
  }
  
  console.log(`[alignLyrics] 开始对齐${key}歌词，主歌词${lyrics.length}行，辅助歌词${otherLyrics.length}行`);
  
  // 策略1：如果行数相同，直接按顺序一一对应（不考虑时间差）
  if (lyrics.length === otherLyrics.length) {
    console.log(`[alignLyrics] 使用策略1：行数相同，直接对应`);
    for (let i = 0; i < lyrics.length; i++) {
      (lyrics[i] as any)[key] = otherLyrics[i].content;
    }
    return lyrics;
  }
  
  // 策略2：使用时间最接近匹配
  console.log(`[alignLyrics] 使用策略2：时间最接近匹配`);
  
  // 将翻译/音译歌词按时间排序
  const sortedOtherLyrics = [...otherLyrics].sort((a, b) => a.time - b.time);
  
  // 为每行主歌词找到最接近的翻译/音译歌词
  lyrics.forEach(mainLine => {
    // 找到时间最接近的翻译行
    let bestMatch = sortedOtherLyrics[0];
    let minTimeDiff = Math.abs(mainLine.time - bestMatch.time);
    
    for (const transLine of sortedOtherLyrics) {
      const timeDiff = Math.abs(mainLine.time - transLine.time);
      // 增加容忍度至2秒，因为从网易云源拿到的数据时间差可能较大
      if (timeDiff < minTimeDiff || timeDiff < 2.0) {
        minTimeDiff = timeDiff;
        bestMatch = transLine;
        
        // 如果找到几乎完全匹配的，就不再继续查找
        if (timeDiff < 0.1) {
          break;
        }
      }
    }
    
    // 使用找到的最佳匹配
    if (bestMatch) {
      (mainLine as any)[key] = bestMatch.content;
      // 如果时间差太大，记录日志
      if (minTimeDiff > 1.0) {
        console.log(`[alignLyrics] 警告：歌词对齐时间差较大 (${minTimeDiff.toFixed(2)}秒)，主歌词"${
          'TextContent' in mainLine ? mainLine.TextContent.substring(0, 10) : '...'
        }"，翻译歌词"${bestMatch.content.substring(0, 10)}..."`);
      }
    }
  });
  
  console.log(`[alignLyrics] 歌词对齐完成`);
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
  console.log(`[parseAMData] 开始处理AM格式歌词，主歌词${lrcData.length}行，翻译${tranData.length}行，音译${romaData.length}行`);
  
  // 如果翻译或音译数据存在，但行数与主歌词不一致，进行特殊处理
  // 构建翻译和音译的查找映射，按时间索引
  const tranMap = new Map<number, string>();
  const romaMap = new Map<number, string>();
  
  if (tranData.length > 0) {
    console.log(`[parseAMData] 处理翻译歌词数据，共${tranData.length}行`);
    tranData.forEach((line, index) => {
      if (line.words && line.words.length > 0) {
        const timeMs = line.words[0].startTime;
        const content = line.words[0].word;
        tranMap.set(timeMs, content);
        if (index % 10 === 0) {
          console.log(`[parseAMData] 翻译第${index}行：时间${timeMs}ms，内容"${content.substring(0, 15)}..."`);
        }
      } else {
        console.warn(`[parseAMData] 翻译第${index}行没有有效的words数据`);
      }
    });
    console.log(`[parseAMData] 翻译映射表大小: ${tranMap.size}`);
  } else {
    console.log(`[parseAMData] 没有翻译歌词数据`);
  }
  
  if (romaData.length > 0) {
    console.log(`[parseAMData] 处理音译歌词数据，共${romaData.length}行`);
    romaData.forEach((line, index) => {
      if (line.words && line.words.length > 0) {
        const timeMs = line.words[0].startTime;
        const content = line.words[0].word;
        romaMap.set(timeMs, content);
        if (index % 10 === 0) {
          console.log(`[parseAMData] 音译第${index}行：时间${timeMs}ms，内容"${content.substring(0, 15)}..."`);
        }
      } else {
        console.warn(`[parseAMData] 音译第${index}行没有有效的words数据`);
      }
    });
    console.log(`[parseAMData] 音译映射表大小: ${romaMap.size}`);
  } else {
    console.log(`[parseAMData] 没有音译歌词数据`);
  }
  
  // 更宽松的时间匹配容忍度，从3秒增加到8秒
  const TIME_TOLERANCE = 8000; // 8秒容忍度
  
  const result = lrcData.map((line, index, lines) => {
    // 获取当前行的开始时间
    const startTimeMs = line.words && line.words.length > 0 ? line.words[0].startTime : 0;
    
    // 获取下一行的开始时间，或当前行的结束时间
    const endTimeMs = (lines[index + 1]?.words && lines[index + 1].words.length > 0) ? 
                       lines[index + 1].words[0].startTime :
                       (line.words && line.words.length > 0 ? 
                        line.words[line.words.length - 1].endTime : 
                        startTimeMs + 5000); // 默认5秒
    
    // 寻找最接近的翻译
    let translatedLyric = "";
    if (tranData.length === lrcData.length) {
      // 如果行数相同，直接使用对应行
      translatedLyric = tranData[index]?.words?.[0]?.word ?? "";
      if (index % 10 === 0) {
        console.log(`[parseAMData] 直接映射：第${index}行翻译"${translatedLyric.substring(0, 15)}..."`);
      }
    } else if (tranMap.size > 0) {
      // 优先尝试精确匹配时间
      if (tranMap.has(startTimeMs)) {
        translatedLyric = tranMap.get(startTimeMs) ?? "";
        if (index % 10 === 0) {
          console.log(`[parseAMData] 精确匹配：第${index}行翻译"${translatedLyric.substring(0, 15)}..."`);
        }
      } else {
        // 如果没有精确匹配，先尝试查找时间范围内的所有可能匹配
        let possibleMatches: {timeMs: number, content: string, diff: number}[] = [];
        
        for (const [timeMs, content] of tranMap.entries()) {
          const diff = Math.abs(timeMs - startTimeMs);
          if (diff < TIME_TOLERANCE) {
            possibleMatches.push({timeMs, content, diff});
          }
        }
        
        // 如果找到多个可能的匹配，选择时间差最小的
        if (possibleMatches.length > 0) {
          // 按时间差排序
          possibleMatches.sort((a, b) => a.diff - b.diff);
          translatedLyric = possibleMatches[0].content;
          if (index % 10 === 0) {
            console.log(`[parseAMData] 最佳匹配：第${index}行翻译，时间差${possibleMatches[0].diff}ms，内容"${translatedLyric.substring(0, 15)}..."`);
          }
        } else if (index % 10 === 0) {
          console.log(`[parseAMData] 未找到匹配：第${index}行翻译`);
        }
      }
    }
    
    // 寻找最接近的音译
    let romanLyric = "";
    if (romaData.length === lrcData.length) {
      // 如果行数相同，直接使用对应行
      romanLyric = romaData[index]?.words?.[0]?.word ?? "";
      if (index % 10 === 0) {
        console.log(`[parseAMData] 直接映射：第${index}行音译"${romanLyric.substring(0, 15)}..."`);
      }
    } else if (romaMap.size > 0) {
      // 优先尝试精确匹配时间
      if (romaMap.has(startTimeMs)) {
        romanLyric = romaMap.get(startTimeMs) ?? "";
        if (index % 10 === 0) {
          console.log(`[parseAMData] 精确匹配：第${index}行音译"${romanLyric.substring(0, 15)}..."`);
        }
      } else {
        // 如果没有精确匹配，先尝试查找时间范围内的所有可能匹配
        let possibleMatches: {timeMs: number, content: string, diff: number}[] = [];
        
        for (const [timeMs, content] of romaMap.entries()) {
          const diff = Math.abs(timeMs - startTimeMs);
          if (diff < TIME_TOLERANCE) {
            possibleMatches.push({timeMs, content, diff});
          }
        }
        
        // 如果找到多个可能的匹配，选择时间差最小的
        if (possibleMatches.length > 0) {
          // 按时间差排序
          possibleMatches.sort((a, b) => a.diff - b.diff);
          romanLyric = possibleMatches[0].content;
          if (index % 10 === 0) {
            console.log(`[parseAMData] 最佳匹配：第${index}行音译，时间差${possibleMatches[0].diff}ms，内容"${romanLyric.substring(0, 15)}..."`);
          }
        } else if (index % 10 === 0) {
          console.log(`[parseAMData] 未找到匹配：第${index}行音译`);
        }
      }
    }
    
    // 如果一条歌词的翻译和音译都为空，尝试最后一次的顺序匹配
    if (!translatedLyric && tranData.length > 0) {
      // 确保不越界
      const safeIndex = Math.min(index, tranData.length - 1);
      if (safeIndex >= 0 && tranData[safeIndex]?.words?.[0]) {
        translatedLyric = tranData[safeIndex].words[0].word ?? "";
        console.log(`[parseAMData] 备用方法：使用顺序映射第${index}行翻译"${translatedLyric?.substring(0, 15)}..."`);
      }
    }
    
    if (!romanLyric && romaData.length > 0) {
      // 确保不越界
      const safeIndex = Math.min(index, romaData.length - 1);
      if (safeIndex >= 0 && romaData[safeIndex]?.words?.[0]) {
        romanLyric = romaData[safeIndex].words[0].word ?? "";
        console.log(`[parseAMData] 备用方法：使用顺序映射第${index}行音译"${romanLyric?.substring(0, 15)}..."`);
      }
    }
    
    // 确保翻译和音译不为undefined或null
    translatedLyric = translatedLyric || "";
    romanLyric = romanLyric || "";
    
    if (index % 10 === 0) {
      console.log(`[parseAMData] 最终结果：第${index}行，开始时间${startTimeMs}ms，翻译"${
        translatedLyric?.substring(0, 15)}..."，音译"${romanLyric?.substring(0, 15)}..."`);
    }
    
    return {
      words: line.words || [],
      startTime: startTimeMs,
      endTime: endTimeMs,
      translatedLyric: translatedLyric || "",
      romanLyric: romanLyric || "",
      isBG: line.isBG ?? false,
      isDuet: line.isDuet ?? false,
    };
  });
  
  // 最终检查：确保所有行都有非undefined的翻译和音译
  for (let i = 0; i < result.length; i++) {
    result[i].translatedLyric = result[i].translatedLyric || "";
    result[i].romanLyric = result[i].romanLyric || "";
  }
  
  console.log(`[parseAMData] 处理完成，共生成${result.length}行AM格式歌词`);
  
  return result;
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