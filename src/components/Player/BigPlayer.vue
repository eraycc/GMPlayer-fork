<template>
  <div
    ref="bigPlayerRef"
    v-show="music.showBigPlayer"
    :class="[
      'bplayer',
      `bplayer-${setting.backgroundImageShow}`,
      isMobile ? 'mobile-player' : 'desktop-player'
    ]"
    :style="[
      music.getPlaySongData && setting.backgroundImageShow === 'blur'
        ? 'background-image: url(' +
          music.getPlaySongData.album.picUrl.replace(/^http:/, 'https:') +
          '?param=50y50)'
        : '',
      `--cover-bg: ${songPicGradient}`,
      `--main-cover-color: rgb(${setting.immersivePlayer ? songPicColor : '255,255,255'})`,
    ]"
  >
    <!-- 共用部分: 背景和顶部菜单 -->
    <Transition name="fade" mode="out-in">
      <div :key="`bg--${songPicGradient}`" :class="['overlay', setting.backgroundImageShow]">
        <template v-if="setting.backgroundImageShow === 'blur'">
          <img v-for="item in 4" :key="item" :src="music.getPlaySongData.album.picUrl.replace(/^http:/, 'https:') +
            `?param=${item * 50}y${item * 50}`" :style="{
              transform: `rotate(${item * 180}deg)`,
            }" class="overlay-img" alt="overlay" />
        </template>
      </div>
    </Transition>

    <template v-if="setting.backgroundImageShow === 'eplor'">
      <BackgroundRender 
        :fps="music.getPlayState ? setting.fps : 0"
        :playing="actualPlayingProp"
        :flowSpeed="music.getPlayState ? (setting.dynamicFlowSpeed ? dynamicFlowSpeed : setting.flowSpeed) : 0"
        :album="setting.albumImageUrl === 'none' ? music.getPlaySongData.album.picUrl.replace(/^http:/, 'https:') : setting.albumImageUrl"
        :renderScale="setting.renderScale" 
        class="overlay" />
    </template>

    <div :class="setting.backgroundImageShow === 'blur' ? 'gray blur' : 'gray'" />
    
    <div class="icon-menu">
      <div class="menu-left">
        <div v-if="setting.showLyricSetting" class="icon">
          <n-icon class="setting" size="30" :component="SettingsRound" @click="LyricSettingRef.openLyricSetting()" />
        </div>
      </div>
      <div class="menu-right">
        <div class="icon">
          <n-icon class="screenfull" :component="screenfullIcon" @click="screenfullChange" />
        </div>
        <div class="icon">
          <n-icon class="close" :component="KeyboardArrowDownFilled" @click="closeBigPlayer" />
        </div>
      </div>
    </div>

    <!-- 移动端布局 -->
    <template v-if="isMobile">
      <!-- 移动端歌曲信息 -->
      <div v-if="!hasHeaderComponent" class="mobile-song-info">
        <div class="name text-hidden">
          <span>{{ music.getPlaySongData ? music.getPlaySongData.name : $t("other.noSong") }}</span>
          <span v-if="music.getPlaySongData && music.getPlaySongData.alia">{{ music.getPlaySongData.alia[0] }}</span>
        </div>
        <div class="artists text-hidden" v-if="music.getPlaySongData && music.getPlaySongData.artist">
          <span class="artist" v-for="(item, index) in music.getPlaySongData.artist" :key="item">
            <span>{{ item.name }}</span>
            <span v-if="index != music.getPlaySongData.artist.length - 1">/</span>
          </span>
        </div>
      </div>

      <!-- 移动端主内容区 -->
      <div class="mobile-content" ref="rightContentRef">
        <div class="mobile-tip" ref="tipRef" v-show="lrcMouseStatus">
          <n-text>{{ $t("other.lrcClicks") }}</n-text>
        </div>

        <div class="mobile-lyrics-container" v-if="
          music.getPlaySongLyric && music.getPlaySongLyric.lrc &&
          music.getPlaySongLyric.lrc[0] &&
          music.getPlaySongLyric.lrc.length > 4
        ">
          <RollingLyrics 
            @mouseenter="lrcMouseStatus = setting.lrcMousePause ? true : false" 
            @mouseleave="lrcAllLeave" 
            @lrcTextClick="lrcTextClick" 
            class="mobile-lyrics"
          ></RollingLyrics>
        </div>

        <div class="mobile-controls">
          <div class="time">
            <span>{{ music.getPlaySongTime.songTimePlayed }}</span>
            <vue-slider v-model="music.getPlaySongTime.barMoveDistance" @drag-start="music.setPlayState(false)"
              @drag-end="sliderDragEnd" @click.stop="
                songTimeSliderUpdate(music.getPlaySongTime.barMoveDistance)
                " :tooltip="'none'" />
            <span>{{ music.getPlaySongTime.songTimeDuration }}</span>
          </div>

          <div class="control">
            <n-icon v-if="!music.getPersonalFmMode" class="prev" size="30" :component="SkipPreviousRound"
              @click.stop="music.setPlaySongIndex('prev')" />
            <n-icon v-else class="dislike" :component="ThumbDownRound"
              @click="music.setFmDislike(music.getPersonalFmData.id)" />
            <div class="play-state">
              <n-button :loading="music.getLoadingState" secondary circle :keyboard="false" :focusable="false">
                <template #icon>
                  <Transition name="fade" mode="out-in">
                    <n-icon size="42" :component="music.getPlayState ? PauseRound : PlayArrowRound"
                      @click.stop="music.setPlayState(!music.getPlayState)" />
                  </Transition>
                </template>
              </n-button>
            </div>
            <n-icon class="next" size="30" :component="SkipNextRound"
              @click.stop="music.setPlaySongIndex('next')" />
          </div>
        </div>
      </div>
    </template>

    <!-- 桌面端布局 -->
    <template v-else>
      <div :class="music.getPlaySongLyric && music.getPlaySongLyric.lrc && music.getPlaySongLyric.lrc[0] && music.getPlaySongLyric.lrc.length > 4 && !music.getLoadingState
        ? 'all'
        : 'all noLrc'
      ">
        <div class="tip" ref="tipRef" v-show="lrcMouseStatus">
          <n-text>{{ $t("other.lrcClicks") }}</n-text>
        </div>
        
        <div class="left" ref="leftContentRef">
          <PlayerCover v-if="setting.playerStyle === 'cover'" />
          <PlayerRecord v-else-if="setting.playerStyle === 'record'" />
        </div>
        
        <div class="right" ref="rightContentRef">
          <div class="lrcShow" v-if="
            music.getPlaySongLyric && music.getPlaySongLyric.lrc &&
            music.getPlaySongLyric.lrc[0] &&
            music.getPlaySongLyric.lrc.length > 4
          ">
            <div class="data" v-show="setting.playerStyle === 'record'">
              <div class="name text-hidden">
                <span>{{
                  music.getPlaySongData
                    ? music.getPlaySongData.name
                    : $t("other.noSong")
                }}</span>
                <span v-if="music.getPlaySongData && music.getPlaySongData.alia">{{ music.getPlaySongData.alia[0]
                  }}</span>
              </div>
              <div class="artists text-hidden" v-if="music.getPlaySongData && music.getPlaySongData.artist">
                <span class="artist" v-for="(item, index) in music.getPlaySongData.artist" :key="item">
                  <span>{{ item.name }}</span>
                  <span v-if="index != music.getPlaySongData.artist.length - 1">/</span>
                </span>
              </div>
            </div>
            
            <RollingLyrics 
              @mouseenter="lrcMouseStatus = setting.lrcMousePause ? true : false" 
              @mouseleave="lrcAllLeave" 
              @lrcTextClick="lrcTextClick"
            ></RollingLyrics>
            
            <div :class="menuShow ? 'menu show' : 'menu'" v-show="setting.playerStyle === 'record'">
              <div class="time">
                <span>{{ music.getPlaySongTime.songTimePlayed }}</span>
                <vue-slider v-model="music.getPlaySongTime.barMoveDistance" @drag-start="music.setPlayState(false)"
                  @drag-end="sliderDragEnd" @click.stop="
                    songTimeSliderUpdate(music.getPlaySongTime.barMoveDistance)
                    " :tooltip="'none'" />
                <span>{{ music.getPlaySongTime.songTimeDuration }}</span>
              </div>
              <div class="control">
                <n-icon v-if="!music.getPersonalFmMode" class="prev" size="30" :component="SkipPreviousRound"
                  @click.stop="music.setPlaySongIndex('prev')" />
                <n-icon v-else class="dislike" :component="ThumbDownRound"
                  @click="music.setFmDislike(music.getPersonalFmData.id)" />
                <div class="play-state">
                  <n-button :loading="music.getLoadingState" secondary circle :keyboard="false" :focusable="false">
                    <template #icon>
                      <Transition name="fade" mode="out-in">
                        <n-icon size="42" :component="music.getPlayState ? PauseRound : PlayArrowRound"
                          @click.stop="music.setPlayState(!music.getPlayState)" />
                      </Transition>
                    </template>
                  </n-button>
                </div>
                <n-icon class="next" size="30" :component="SkipNextRound"
                  @click.stop="music.setPlaySongIndex('next')" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    
    <!-- 共用组件 -->
    <Spectrum v-if="setting.musicFrequency" :height="60" :show="music.showBigPlayer" />
    <LyricSetting ref="LyricSettingRef" />
  </div>
</template>

<script setup>
import {
  PlayArrowRound,
  KeyboardArrowDownFilled,
  FullscreenRound,
  FullscreenExitRound,
  SettingsRound,
  PauseRound,
  SkipNextRound,
  SkipPreviousRound,
  ThumbDownRound,
} from "@vicons/material";
import { musicStore, settingStore, siteStore } from "@/store";
import { useRouter } from "vue-router";
import { setSeek } from "@/utils/Player";
import PlayerRecord from "./PlayerRecord.vue";
import PlayerCover from "./PlayerCover.vue";
import RollingLyrics from "./RollingLyrics.vue";
import Spectrum from "./Spectrum.vue";
import LyricSetting from "@/components/DataModal/LyricSetting.vue";
import screenfull from "screenfull";
import VueSlider from "vue-slider-component";
import "vue-slider-component/theme/default.css";
import BackgroundRender from "@/libs/apple-music-like/BackgroundRender.vue";
import { throttle } from "throttle-debounce"
import { analyzeAudioIntensity } from "../../utils/fftIntensityAnalyze";
import { storeToRefs } from "pinia";
import gsap from "gsap";
import {
  onMounted,
  nextTick,
  watch,
  ref,
  shallowRef,
  computed,
  onBeforeUnmount,
} from "vue";

const router = useRouter();
const music = musicStore();
const site = siteStore();
const setting = settingStore();

const { songPicGradient, songPicColor } = storeToRefs(site)

// 创建需要的refs用于GSAP动画
const bigPlayerRef = ref(null);
const tipRef = ref(null);
const leftContentRef = ref(null);
const rightContentRef = ref(null);

// 检测是否为移动设备
const isMobile = ref(false);

// 检测是否页面上已有标题组件
const hasHeaderComponent = ref(false);

// 检测视窗尺寸变化，更新移动设备状态
const updateDeviceStatus = () => {
  isMobile.value = window.innerWidth <= 768;
  console.log("isMobile", isMobile.value);
};

// 检测页面上是否存在标题组件
const checkHeaderComponent = () => {
  // 检查页面上是否已经存在歌曲标题组件
  const headerElements = document.querySelectorAll('.page-title, .song-title, .header-title');
  hasHeaderComponent.value = headerElements.length > 0;
};

// State to force playing=true for the initial tick only
const forcePlaying = ref(true);

// Computed property to determine the actual value for the :playing prop
const actualPlayingProp = computed(() => {
  const isForced = forcePlaying.value;
  const realState = music.getPlayState;
  // Calculate the result based on the logic: force true initially, then follow real state
  const result = isForced || realState;
  // Log the dependencies and the result for debugging
  console.log(
    `-- computed actualPlayingProp -- forcePlaying: ${isForced}, music.getPlayState: ${realState}, result: ${result}`
  );
  return result;
});

// Keep the dynamic flow speed logic if needed by :flowSpeed binding
const dynamicFlowSpeed = ref(2);

// 工具栏显隐
const menuShow = ref(false);

// 歌词设置弹窗
const LyricSettingRef = ref(null);

// 关闭大播放器
const closeBigPlayer = () => {
  // 使用GSAP动画关闭播放器
  gsap.to(bigPlayerRef.value, {
    y: window.innerHeight, 
    opacity: 0,
    duration: 0.5,
    ease: "power2.inOut",
    onComplete: () => {
      music.setBigPlayerState(false);
    }
  });
};

// 歌词文本点击事件
const lrcTextClick = (time) => {
  if (typeof $player !== "undefined") {
    // 防止soundStop被调用
    music.persistData.playSongTime.currentTime = time;
    $player.seek(time);
    music.setPlayState(true);
  }
  lrcMouseStatus.value = false;
};

// 歌曲进度条更新
const sliderDragEnd = () => {
  songTimeSliderUpdate(music.getPlaySongTime.barMoveDistance);
  music.setPlayState(true);
};
const songTimeSliderUpdate = (val) => {
  if (typeof $player !== "undefined" && music.getPlaySongTime?.duration) {
    const currentTime = (music.getPlaySongTime.duration / 100) * val;
    setSeek($player, currentTime);
  }
};

// 鼠标移出歌词区域
const lrcMouseStatus = ref(false);
const lrcAllLeave = () => {
  lrcMouseStatus.value = false;
  lyricsScroll(music.getPlaySongLyricIndex);
};

// 使用GSAP动画显示提示文本
const animateTip = (isVisible) => {
  if (!tipRef.value) return;
  
  if (isVisible) {
    gsap.fromTo(tipRef.value, 
      { opacity: 0, y: -20 },
      { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }
    );
  } else {
    gsap.to(tipRef.value, {
      opacity: 0,
      y: -20,
      duration: 0.3,
      ease: "power2.in"
    });
  }
};

// 全屏切换
const timeOut = ref(null);
const screenfullIcon = shallowRef(FullscreenRound);
const screenfullChange = () => {
  if (screenfull.isEnabled) {
    screenfull.toggle();
    screenfullIcon.value = screenfull.isFullscreen
      ? FullscreenRound
      : FullscreenExitRound;
    // 延迟一段时间执行列表滚动
    timeOut.value = setTimeout(() => {
      lrcMouseStatus.value = false;
      lyricsScroll(music.getPlaySongLyricIndex);
    }, 500);
  }
};

// 前往评论 | 暂时废弃
const toComment = () => {
  music.setBigPlayerState(false);
  router.push({
    path: "/comment",
    query: {
      id: music.getPlaySongData ? music.getPlaySongData.id : null,
    },
  });
};

// 歌词滚动
const lyricsScroll = (index) => {
  const type = setting.lyricsBlock;
  const lrcType =
    !music.getPlaySongLyric.hasYrc || !setting.showYrc ? "lrc" : "yrc";
  const el = document.getElementById(lrcType + index);
  
  if (!el || lrcMouseStatus.value) return;
  
  // 获取歌词容器元素
  const container = el.parentElement;
  if (!container) return;
  
  const containerHeight = container.clientHeight;
  
  // 为移动端和桌面端使用不同的滚动计算方式
  let scrollDistance;
  
  if (isMobile.value) {
    // 移动端滚动位置偏上，使活跃歌词在屏幕中上部显示
    scrollDistance = el.offsetTop - container.offsetTop - containerHeight * 0.35;
  } else {
    // 桌面端根据设置使用居中或偏上显示
    scrollDistance = el.offsetTop - container.offsetTop - 
      (type === "center" ? containerHeight / 2 - el.offsetHeight / 2 : 80);
  }
  
  // 使用GSAP动画滚动
  gsap.to(container, {
    scrollTop: scrollDistance,
    duration: 0.5,
    ease: "cubic-bezier(0.34, 1.56, 0.64, 1)" // 使用贝塞尔曲线
  });
};

// 改变 PWA 应用标题栏颜色
const changePwaColor = () => {
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (music.showBigPlayer) {
    themeColorMeta.setAttribute("content", songPicColor);
  } else {
    if (setting.getSiteTheme === "light") {
      themeColorMeta.setAttribute("content", "#ffffff");
    } else if (setting.getSiteTheme === "dark") {
      themeColorMeta.setAttribute("content", "#18181c");
    }
  }
};

// 使用GSAP动画显示播放器
const animatePlayerIn = () => {
  if (!bigPlayerRef.value) return;
  
  // 主容器动画
  gsap.fromTo(bigPlayerRef.value, 
    { opacity: 0, y: window.innerHeight },
    { 
      opacity: 1, 
      y: 0, 
      duration: 0.5, 
      ease: "cubic-bezier(0.34, 1.56, 0.64, 1)" // 使用贝塞尔曲线
    }
  );
  
  if (isMobile.value) {
    // 移动端动画
    if (rightContentRef.value) {
      gsap.fromTo(rightContentRef.value,
        { opacity: 0, y: 50 },
        { 
          opacity: 1, 
          y: 0,
          duration: 0.6, 
          delay: 0.2,
          ease: "power2.out" 
        }
      );
    }
  } else {
    // 桌面端动画
    // 左侧内容动画
    if (leftContentRef.value) {
      gsap.fromTo(leftContentRef.value,
        { opacity: 0, x: -50 },
        { 
          opacity: 1, 
          x: 0, 
          duration: 0.6, 
          delay: 0.2,
          ease: "power2.out" 
        }
      );
    }
    
    // 右侧内容动画
    if (rightContentRef.value) {
      gsap.fromTo(rightContentRef.value,
        { opacity: 0, x: 50 },
        { 
          opacity: 1, 
          x: 0,
          duration: 0.6, 
          delay: 0.3,
          ease: "power2.out" 
        }
      );
    }
  }
};

onMounted(() => {
  console.log("BigPlayer onMounted - forcePlaying initially:", forcePlaying.value);
  
  // 初始化设备检测
  updateDeviceStatus();
  window.addEventListener('resize', updateDeviceStatus);
  
  // 检测页面上是否已有标题组件
  checkHeaderComponent();
  
  nextTick(() => {
    console.log(
      "BigPlayer nextTick starts - forcePlaying BEFORE change:",
      forcePlaying.value
    );
    // After the first tick, disable the forcing flag
    forcePlaying.value = false;
    console.log(
      "BigPlayer nextTick ends - forcePlaying AFTER change:",
      forcePlaying.value
    );

    // Existing logic from nextTick
    if (setting.backgroundImageShow === "eplor") {
      console.log("Eplor mode active on mount.");
    }
    lyricsScroll(music.getPlaySongLyricIndex);
  });
});

onBeforeUnmount(() => {
  clearTimeout(timeOut.value);
  window.removeEventListener('resize', updateDeviceStatus);
});

// 监听页面是否打开
watch(
  () => music.showBigPlayer,
  (val) => {
    changePwaColor();
    if (val) {
      console.log("开启播放器", music.getPlaySongLyricIndex);
      // 重新检测页面上是否已有标题组件
      checkHeaderComponent();
      nextTick().then(() => {
        music.showPlayList = false;
        lyricsScroll(music.getPlaySongLyricIndex);
        animatePlayerIn(); // 添加GSAP入场动画
      });
    }
  }
);

// 监听移动设备状态变化
watch(
  () => isMobile.value,
  () => {
    // 设备状态变化时，重新计算歌词滚动位置
    nextTick(() => {
      lyricsScroll(music.getPlaySongLyricIndex);
    });
  }
);

// 监听歌词提示状态
watch(
  () => lrcMouseStatus.value,
  (val) => {
    animateTip(val);
  }
);

// 监听歌词滚动
watch(
  () => music.getPlaySongLyricIndex,
  (val) => lyricsScroll(val)
);

// 监听频谱更新
watch(() => music.getSpectrumsData, throttle(200, (val) => {
  if (!music.getPlayState || !setting.dynamicFlowSpeed) return;
  const variance = Math.max(Math.round(analyzeAudioIntensity(val) * setting.dynamicFlowSpeedScale * 7), 6)
  dynamicFlowSpeed.value = variance
}))

// 监听主题色改变
watch(
  () => site.songPicColor,
  () => changePwaColor()
);
</script>

<style lang="scss" scoped>
.bplayer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2000;
  overflow: hidden;
  color: var(--main-cover-color);
  background-repeat: no-repeat;
  background-size: 150% 150%;
  background-position: center;
  display: flex;
  justify-content: center;

  /* 移动端样式特殊处理 */
  &.mobile-player {
    display: flex;
    flex-direction: column;
    
    .mobile-song-info {
      padding: 0 5vw;
      margin-top: 80px;
      z-index: 3;
      text-align: center;

      .name {
        font-size: 1.5rem;
        line-height: 1.3;
        margin-bottom: 6px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;

        span {
          &:nth-of-type(2) {
            margin-left: 8px;
            font-size: 1rem;
            opacity: 0.6;
          }
        }
      }

      .artists {
        font-size: 0.9rem;
        opacity: 0.7;
      }
    }
    
    .mobile-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 20px 5vw;
      overflow: hidden;
      
      .mobile-tip {
        position: absolute;
        top: 90px;
        left: 10%;
        width: 80%;
        height: 40px;
        border-radius: 25px;
        background-color: #ffffff20;
        -webkit-backdrop-filter: blur(20px);
        backdrop-filter: blur(20px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 4;
        
        span {
          color: #ffffffc7;
        }
      }
      
      .mobile-lyrics-container {
        flex: 1;
        overflow: hidden;
        margin-bottom: 20px;
        
        .mobile-lyrics {
          height: 100%;
          overflow-y: auto;
          
          :deep(.lrc-content) {
            padding: 30% 0;
          }
          
          :deep(.lrc-item) {
            font-size: 1.1rem;
            line-height: 1.8;
            margin: 10px 0;
            padding: 0 10px;
            
            &.active {
              transform: scale(1.05);
              font-size: 1.2rem;
            }
          }
        }
      }
      
      .mobile-controls {
        padding-bottom: calc(env(safe-area-inset-bottom) + 20px);
        
        .time {
          display: flex;
          align-items: center;
          width: 100%;
          
          span {
            opacity: 0.8;
          }
          
          .vue-slider {
            margin: 0 10px;
            width: 100% !important;
            transform: translateY(-1px);
            cursor: pointer;

            :deep(.vue-slider-rail) {
              background-color: #ffffff20;
              border-radius: 25px;

              .vue-slider-process {
                background-color: var(--main-cover-color) !important;
              }

              .vue-slider-dot {
                width: 12px !important;
                height: 12px !important;
                box-shadow: none;
              }
            }
          }
        }
        
        .control {
          margin-top: 20px;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          transform: scale(1.2);
          
          .next,
          .prev,
          .dislike {
            cursor: pointer;
            padding: 4px;
            border-radius: 50%;
            transition: all 0.3s;

            &:hover {
              background-color: var(--main-color);
            }

            &:active {
              transform: scale(0.9);
            }
          }
          
          .play-state {
            --n-width: 42px;
            --n-height: 42px;
            color: var(--main-cover-color);
            margin: 0 12px;
            transition:
              background-color 0.3s,
              transform 0.3s;

            .n-icon {
              transition: opacity 0.1s ease-in-out;
              color: var(--main-cover-color);
            }

            &:active {
              transform: scale(1);
            }
          }
        }
      }
    }
  }

  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    z-index: -1;

    &.solid {
      background: var(--cover-bg)
    }

    &::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: #00000060;
    }

    &.blur {
      display: flex;
      align-items: center;
      justify-content: center;

      .overlay-img {
        width: 150%;
        height: 150%;
        filter: blur(80px) contrast(1.2);
      }
    }

    &.none {
      &::after {
        display: none;
      }
    }
  }

  .gray {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: #00000030;
    -webkit-backdrop-filter: blur(80px);
    backdrop-filter: blur(80px);
    z-index: -1;

    &.blur {
      background-color: #00000060;
    }
  }

  &.bplayer-eplor {
    .gray {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  .icon-menu {
    padding: 20px;
    width: 100%;
    height: 80px;
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 5; /* 提高层级确保按钮可点击 */
    box-sizing: border-box;

    .menu-left,
    .menu-right {
      display: flex;
      align-items: center;

      .icon {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        opacity: 0.3;
        border-radius: 8px;
        transition: all 0.3s;
        cursor: pointer;

        &:hover {
          background-color: #ffffff20;
          transform: scale(1.05);
          opacity: 1;
        }

        &:active {
          transform: scale(1);
        }

        .screenfull,
        .setting {
          @media (max-width: 768px) {
            display: none;
          }
        }
      }
    }

    .menu-right {
      .icon {
        margin-left: 12px;
      }
    }
  }

  .all {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: row;
    will-change: transform, padding-right;
    align-items: center;
    transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;

    &.noLrc {
      .left {
        padding-right: 0;
        width: 50%;
        transform: translateX(25vh);

        @media (max-width: 1200px) {
          transform: translateX(22.2vh);
        }

        @media (min-width: 769px) and (max-width: 869px) {
          transform: translateX(20.1vh);
        }
      }
    }

    .tip {
      position: absolute;
      top: 24px;
      left: calc(50% - 150px);
      width: 300px;
      height: 40px;
      border-radius: 25px;
      background-color: #ffffff20;
      -webkit-backdrop-filter: blur(20px);
      backdrop-filter: blur(20px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 4;

      span {
        color: #ffffffc7;
      }
    }

    .left {
      transform: translateX(0);
      width: 40%;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: center;
      transition: all 0.3s ease-in-out;
      padding-right: 5rem;
      box-sizing: border-box;
    }

    .right {
      transform: translateX(0);
      flex: 1;
      height: 100%;

      .lrcShow {
        height: 100%;
        display: flex;
        justify-content: center;
        flex-direction: column;

        .data {
          padding: 0 3vh;
          margin-bottom: 8px;

          .name {
            font-size: 3vh;
            -webkit-line-clamp: 2;
            line-clamp: 2;
            padding-right: 26px;

            span {
              &:nth-of-type(2) {
                margin-left: 12px;
                font-size: 2.3vh;
                opacity: 0.6;
              }
            }
          }

          .artists {
            margin-top: 4px;
            opacity: 0.6;
            font-size: 1.8vh;

            .artist {
              span {
                &:nth-of-type(2) {
                  margin: 0 2px;
                }
              }
            }
          }
        }

        .menu {
          opacity: 0;
          padding: 1vh 2vh;
          display: flex !important;
          justify-content: center;
          align-items: center;
          transition: all 0.3s;
          flex-direction: column;

          .time {
            display: flex;
            flex-direction: row;
            align-items: center;
            width: 100%;
            margin-right: 3em;
            margin-left: 3em;

            span {
              opacity: 0.8;
            }

            .vue-slider {
              margin: 0 10px;
              width: 100% !important;
              transform: translateY(-1px);
              cursor: pointer;


              :deep(.vue-slider-rail) {
                background-color: #ffffff20;
                border-radius: 25px;

                .vue-slider-process {
                  background-color: var(--main-cover-color) !important;
                }

                .vue-slider-dot {
                  width: 12px !important;
                  height: 12px !important;
                  box-shadow: none;
                }

                .vue-slider-dot-handle-focus {
                  box-shadow: none;
                }

                .vue-slider-dot-tooltip-inner {
                  background-color: var(--main-cover-color) !important;
                  backdrop-filter: blur(2px);
                  border: none
                }

                .vue-slider-dot-handle {
                  background-color: var(--main-cover-color) !important
                }

                .vue-slider-dot-tooltip-text {
                  color: black;
                }
              }
            }
          }

          .control {
            margin-top: 0.8em;
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            transform: scale(1.4);

            .next,
            .prev,
            .dislike {
              cursor: pointer;
              padding: 4px;
              border-radius: 50%;
              transition: all 0.3s;

              &:hover {
                background-color: var(--main-color);
              }

              &:active {
                transform: scale(0.9);
              }
            }

            .dislike {
              padding: 9px;
            }

            .play-state {
              --n-width: 42px;
              --n-height: 42px;
              color: var(--main-cover-color);
              margin: 0 12px;
              transition:
                background-color 0.3s,
                transform 0.3s;

              .n-icon {
                transition: opacity 0.1s ease-in-out;
                color: var(--main-cover-color);
              }

              &:active {
                transform: scale(1);
              }
            }
          }

          &.show {
            opacity: 1;
          }

          .n-icon {
            font-size: 24px;
            cursor: pointer;
            padding: 8px;
            border-radius: 8px;
            opacity: 0.4;
            transition: all 0.3s;

            &:hover {
              background-color: #ffffff30;
            }

            &:active {
              transform: scale(0.95);
            }

            &.open {
              opacity: 1;
            }

          }
        }
      }
    }
  }

  .canvas {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    max-width: 1600px;
    z-index: -1;
    position: absolute;
    bottom: 0;
    -webkit-mask: linear-gradient(to right,
        hsla(0deg, 0%, 100%, 0) 0,
        hsla(0deg, 0%, 100%, 0.6) 15%,
        #fff 30%,
        #fff 70%,
        hsla(0deg, 0%, 100%, 0.6) 85%,
        hsla(0deg, 0%, 100%, 0));
    mask: linear-gradient(to right,
        hsla(0deg, 0%, 100%, 0) 0,
        hsla(0deg, 0%, 100%, 0.6) 15%,
        #fff 30%,
        #fff 70%,
        hsla(0deg, 0%, 100%, 0.6) 85%,
        hsla(0deg, 0%, 100%, 0));

    .avBars {
      max-width: 1600px;
      opacity: 0.6;
    }
  }
}

/* 移除未使用的CSS过渡类，因为现在使用GSAP */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
