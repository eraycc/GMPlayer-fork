import axios from "@/utils/request";
// Import specific parsers and types instead of the non-existent Lyric class
import { parseLrc, parseQrc, parseYrc, parseTTML, LyricLine } from "@applemusic-like-lyrics/lyric";

// Re-define LyricData interface based on parseLyric.ts
interface LyricData {
  lrc?: { lyric: string } | null;
  tlyric?: { lyric: string } | null;
  romalrc?: { lyric: string } | null;
  yrc?: { lyric: string } | null;
  ytlrc?: { lyric: string } | null;
  yromalrc?: { lyric: string } | null;
  code?: number;
  // 添加TTML相关字段，用于传递TTML数据
  hasTTML?: boolean;
  ttml?: any;
}

// Interface for the raw response from Netease /lyric endpoint (assumed structure)
interface NeteaseRawLyricResponse extends LyricData {
  // Potentially other fields like klyric, etc.
}

// Updated interface for the *actual* Lyric Atlas API response structure based on logs
interface LyricAtlasDirectResponse {
  found: boolean;
  id: string; // API returns string ID
  format?: 'lrc' | 'qrc' | 'ttml' | string;
  source?: string;
  content?: string; // Raw lyric string
  // API might return other fields, add if necessary
}

// TTML格式歌词的接口声明
interface TTMLLyric {
  lines: LyricLine[];
  // 其他TTML可能包含的属性
}

// Define the Lyric Provider interface - now returns LyricData
interface LyricProvider {
  getLyric(id: number): Promise<LyricData | null>;
}

/**
 * 检测歌词格式是QRC还是YRC
 * YRC格式通常包含[x-trans]标记，而QRC通常包含<1,1,0>格式的时间标记
 * @param content 歌词内容
 * @returns 'yrc'或'qrc'
 */
function getYrcType(content: string): 'yrc' | 'qrc' {
  // YRC 特征检测
  if (content.includes('[x-trans') || content.includes('[merge]')) {
    return 'yrc';
  }
  
  // QRC 特征检测 - 包含类似<1,1,0>的时间标记
  if (content.includes('<') && content.includes(',') && content.includes('>')) {
    return 'qrc';
  }
  
  // 默认返回qrc格式（这是一种保守做法）
  console.warn('[LyricService] 无法确定歌词类型，默认使用QRC格式');
  return 'qrc';
}

// Implementation for the Netease API - Return raw data matching LyricData format
class NeteaseLyricProvider implements LyricProvider {
  async getLyric(id: number): Promise<LyricData | null> {
    try {
      const response: NeteaseRawLyricResponse = await axios({
        method: "GET",
        hiddenBar: true,
        url: "/lyric",
        params: { id },
      });

      // Ensure the response has a code, default to 200 if missing but data exists
      if (response && (response.lrc || response.tlyric || response.yrc)) {
          if (typeof response.code === 'undefined') {
              response.code = 200;
          }
      } else if (!response || response.code !== 200) {
          console.warn("Netease lyric response indicates failure or no data:", response);
          return null; // Return null if code is not 200 or data is missing
      }

      return response;
    } catch (error) {
      console.error("Failed to fetch lyrics from Netease:", error);
      return null;
    }
  }
}

// Implementation for the Lyric-Atlas API - ADJUSTED FOR ACTUAL RESPONSE
class LyricAtlasProvider implements LyricProvider {
  async getLyric(id: number): Promise<LyricData | null> {
    const apiUrl = import.meta.env.VITE_LYRIC_ATLAS_API_URL as string;
    if (!apiUrl) {
      console.error("VITE_LYRIC_ATLAS_API_URL is not defined in .env");
      return null;
    }
    try {
      // Expecting the direct response structure now
      const response: LyricAtlasDirectResponse = await axios({
        method: 'GET',
        hiddenBar: true,
        baseURL: apiUrl,
        url: `/api/search`,
        params: { id }, // Keep numeric ID for request
      });

      // Check the actual response structure
      if (!response || !response.found || !response.content || !response.format) {
        console.warn(`No valid lyric content found in Lyric Atlas direct response for id: ${id}`, response);
        return null;
      }

      console.log(`[LyricAtlasProvider] Received direct response for ${id}: format=${response.format}, source=${response.source}`);

      const result: LyricData = {
        code: 200, // Assume success if found=true and content exists
        lrc: { lyric: "[00:00.00]加载歌词中...\n[99:99.99]" }, // 默认提供一个占位lrc，确保UI不会出错
        tlyric: null,
        romalrc: null,
        yrc: null,
        ytlrc: null,
        yromalrc: null,
        hasTTML: false,  // 默认不是TTML格式
        ttml: null       // 默认无TTML数据
      };

      // Map content based on format
      if (response.format === 'lrc') {
        // 对于LRC格式，直接使用内容
        result.lrc = { lyric: response.content };
      } else if (response.format === 'qrc' || response.format === 'yrc') {
        // 将qrc或yrc格式映射到yrc字段
        result.yrc = { lyric: response.content }; // Map qrc/yrc to yrc
        
        // 从qrc/yrc解析并创建lrc格式
        try {
          // 根据格式选择正确的解析器
          let parsedLyric: any[];
          
          // 如果接口已明确返回格式，优先使用返回的格式
          if (response.format === 'qrc') {
            // 使用QRC解析器
            parsedLyric = parseQrc(response.content);
            console.log(`[LyricAtlasProvider] Using QRC parser for id: ${id}`);
          } else if (response.format === 'yrc') {
            // 使用YRC解析器
            parsedLyric = parseYrc(response.content);
            console.log(`[LyricAtlasProvider] Using YRC parser for id: ${id}`);
          } else {
            // 尝试通过内容检测格式
            const contentType = getYrcType(response.content);
            if (contentType === 'yrc') {
              parsedLyric = parseYrc(response.content);
              console.log(`[LyricAtlasProvider] Detected YRC format for id: ${id}`);
            } else {
              parsedLyric = parseQrc(response.content);
              console.log(`[LyricAtlasProvider] Detected QRC format for id: ${id}`);
            }
          }
            
          if (parsedLyric && parsedLyric.length > 0) {
            // 创建LRC文本
            let lrcText = '';
            parsedLyric.forEach(line => {
              if (line.words && line.words.length > 0) {
                const timeMs = line.words[0].startTime;
                const minutes = Math.floor(timeMs / 60000);
                const seconds = ((timeMs % 60000) / 1000).toFixed(2);
                const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.padStart(5, '0')}`;
                const content = line.words.map(w => w.word).join('');
                lrcText += `[${timeStr}]${content}\n`;
              }
            });
            
            // 如果生成的lrc文本为空，回退到默认值
            if (!lrcText.trim()) {
              lrcText = "[00:00.00]无法生成歌词\n[99:99.99]";
            }
            
            result.lrc = { lyric: lrcText };
            console.log(`[LyricAtlasProvider] Successfully created LRC from ${response.format} for id: ${id}`);
          } else {
            // 解析结果为空，使用默认lrc
            result.lrc = { lyric: "[00:00.00]无法解析歌词内容\n[99:99.99]" };
            console.warn(`[LyricAtlasProvider] ${response.format} parsing resulted in empty lines for id: ${id}`);
          }
        } catch (error) {
          console.warn(`[LyricAtlasProvider] Could not extract LRC from ${response.format} for id: ${id}:`, error);
          // 如果无法提取，创建一个占位LRC，确保UI不会出错
          result.lrc = { lyric: "[00:00.00]解析歌词时出错\n[99:99.99]" };
        }
      } else if (response.format === 'ttml') {
        // 处理 TTML 格式
        try {
          const ttmlLyric = parseTTML(response.content) as TTMLLyric;
          
          // 标记拥有TTML格式歌词
          result.hasTTML = true;
          // 存储解析后的TTML数据
          result.ttml = ttmlLyric.lines;
          
          // 为YRC准备数据
          if (ttmlLyric && ttmlLyric.lines && ttmlLyric.lines.length > 0) {
            // 创建一个包含特殊标记的字符串，表示这是已解析的LyricLine[]
            const serializedYrc = `___PARSED_LYRIC_LINES___${JSON.stringify(ttmlLyric.lines)}`;
            result.yrc = { lyric: serializedYrc };
            console.log(`[LyricAtlasProvider] Successfully parsed TTML for id: ${id}, lines: ${ttmlLyric.lines.length}`);
            
            // 同时创建LRC格式的歌词，确保lrc数组有内容
            let lrcText = '';
            ttmlLyric.lines.forEach(line => {
              if (line.words && line.words.length > 0) {
                const timeMs = line.words[0].startTime;
                const minutes = Math.floor(timeMs / 60000);
                const seconds = ((timeMs % 60000) / 1000).toFixed(2);
                const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.padStart(5, '0')}`;
                const content = line.words.map(w => w.word).join('');
                lrcText += `[${timeStr}]${content}\n`;
              }
            });
            
            // 如果生成的lrc文本为空，回退到默认值
            if (!lrcText.trim()) {
              lrcText = "[00:00.00]无法生成歌词\n[99:99.99]";
            }
            
            result.lrc = { lyric: lrcText };
            console.log(`[LyricAtlasProvider] Created compatible LRC format from TTML for id: ${id}`);
          } else {
            console.warn(`[LyricAtlasProvider] TTML parsing resulted in empty lines for id: ${id}`);
            result.lrc = { lyric: "[00:00.00]TTML解析结果为空\n[99:99.99]" };
            result.hasTTML = false; // 解析结果为空，置回false
            result.ttml = null;
          }
        } catch (error) {
          console.error(`[LyricAtlasProvider] Error parsing TTML for id: ${id}:`, error);
          result.lrc = { lyric: "[00:00.00]TTML解析出错\n[99:99.99]" };
          result.hasTTML = false; // 解析出错，置回false
          result.ttml = null;
        }
      } else {
        // 处理未知格式
        console.warn(`[LyricAtlasProvider] Trying to handle unknown format '${response.format}' for id: ${id}`);
        
        // 检查内容是否看起来像LRC
        if (typeof response.content === 'string' && response.content.includes('[') && response.content.includes(']')) {
          // 尝试作为LRC格式处理
          try {
            result.lrc = { lyric: response.content };
            console.log(`[LyricAtlasProvider] Content looks like LRC, using as-is for id: ${id}`);
          } catch (e) {
            console.error(`[LyricAtlasProvider] Error treating content as LRC:`, e);
            result.lrc = { lyric: `[00:00.00]解析${response.format}格式失败\n[99:99.99]` };
          }
        } else {
          // 尝试从纯文本提取内容生成简单LRC
          try {
            let lines = response.content.split(/\r?\n/);
            let lrcText = '';
            
            // 为每行添加时间标记，简单地按顺序分配时间
            lines.forEach((line, index) => {
              if (line.trim()) {
                const minutes = Math.floor(index / 6); // 每行大约10秒
                const seconds = (index % 6) * 10;
                const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.00`;
                lrcText += `[${timeStr}]${line.trim()}\n`;
              }
            });
            
            if (lrcText.trim()) {
              result.lrc = { lyric: lrcText };
              console.log(`[LyricAtlasProvider] Created simple LRC from text content for id: ${id}`);
            } else {
              result.lrc = { lyric: `[00:00.00]未能从${response.format}提取文本\n[99:99.99]` };
            }
          } catch (e) {
            console.error(`[LyricAtlasProvider] Error extracting text from content:`, e);
            result.lrc = { lyric: `[00:00.00]不支持的歌词格式: ${response.format}\n[99:99.99]` };
          }
        }
      }

      return result;

    } catch (error) {
      console.error("Failed to fetch or process lyrics from Lyric Atlas:", error);
      return null;
    }
  }
}

// Lyric Service Factory - fetchLyric now returns Promise<LyricData | null>
export class LyricService {
  private provider: LyricProvider;

  constructor(useLyricAtlas: boolean = false) {
    if (useLyricAtlas && import.meta.env.VITE_LYRIC_ATLAS_API_URL) {
      console.log("Using Lyric Atlas provider.");
      this.provider = new LyricAtlasProvider();
    } else {
      if (useLyricAtlas) {
          console.warn("Lyric Atlas provider selected, but VITE_LYRIC_ATLAS_API_URL is not defined. Falling back to Netease.");
      }
      console.log("Using Netease lyric provider.");
      this.provider = new NeteaseLyricProvider();
    }
  }

  async fetchLyric(id: number): Promise<LyricData | null> {
    try {
      const result = await this.provider.getLyric(id);
      
      // 检查并确保结果始终包含lrc格式的歌词
      if (result) {
        // 确保返回的数据有code字段
        if (result.code === undefined) {
          result.code = 200;
        }
        
        // 如果没有lrc但有yrc，确保我们能从yrc中创建一个基本的lrc
        if ((!result.lrc || !result.lrc.lyric) && result.yrc && result.yrc.lyric) {
          console.log(`[LyricService] No LRC found for id ${id}, attempting to generate from YRC`);
          
          try {
            // 判断内容是否是yrc或qrc格式，并选择对应的解析器
            let parsedLyric;
            
            // 使用内容检测歌词类型
            const content = result.yrc.lyric;
            const contentType = getYrcType(content);
            
            if (contentType === 'yrc') {
              // 使用YRC解析器
              parsedLyric = parseYrc(content);
              console.log(`[LyricService] Using YRC parser for id: ${id}`);
            } else {
              // 使用QRC解析器
              parsedLyric = parseQrc(content);
              console.log(`[LyricService] Using QRC parser for id: ${id}`);
            }
            
            if (parsedLyric && parsedLyric.length > 0) {
              let lrcText = '';
              parsedLyric.forEach(line => {
                if (line.words && line.words.length > 0) {
                  const timeMs = line.words[0].startTime;
                  const minutes = Math.floor(timeMs / 60000);
                  const seconds = ((timeMs % 60000) / 1000).toFixed(2);
                  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.padStart(5, '0')}`;
                  const content = line.words.map(w => w.word).join('');
                  lrcText += `[${timeStr}]${content}\n`;
                }
              });
              
              // 如果成功创建了lrc文本，使用它
              if (lrcText.trim()) {
                result.lrc = { lyric: lrcText };
                console.log(`[LyricService] Successfully generated LRC from ${contentType} for id ${id}`);
              } else {
                // 如果无法创建有效内容，使用占位符
                result.lrc = { lyric: "[00:00.00]无法从歌词生成LRC\n[99:99.99]" };
                console.warn(`[LyricService] Failed to generate meaningful LRC from ${contentType} for id ${id}`);
              }
            } else {
              // 解析YRC/QRC失败，使用占位符
              result.lrc = { lyric: "[00:00.00]无法解析歌词\n[99:99.99]" };
              console.warn(`[LyricService] Failed to parse ${contentType} for id ${id}`);
            }
          } catch (error) {
            // 出现异常，使用占位符
            result.lrc = { lyric: "[00:00.00]处理歌词时出错\n[99:99.99]" };
            console.error(`[LyricService] Error generating LRC from YRC/QRC for id ${id}:`, error);
          }
        }
        
        // 如果没有lrc也没有yrc，使用占位符
        if ((!result.lrc || !result.lrc.lyric) && (!result.yrc || !result.yrc.lyric)) {
          console.warn(`[LyricService] No lyric data (neither LRC nor YRC) found for id ${id}, using placeholder`);
          result.lrc = { lyric: "[00:00.00]暂无歌词\n[99:99.99]" };
        }
      }
      
      return result;
    } catch (error) {
      console.error(`[LyricService] Failed to fetch lyric for id ${id}:`, error);
      return null;
    }
  }
}

export default LyricService;

// Example usage (you'll integrate this properly, likely involving Pinia)
// import { useSettingsStore } from '@/store/settings'; // Assuming a settings store

// const settingsStore = useSettingsStore();
// const lyricService = new LyricService(settingsStore.useLyricAtlasFeature);
// const lyrics = await lyricService.fetchLyric(songId);
// console.log(lyrics); 