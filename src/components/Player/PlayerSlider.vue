<template>
  <n-slider 
    :value="value" 
    @start="onStart"
    @stop="onStop"
    @update:value="onUpdateValue"
    :tooltip="showTooltip"
    :format-tooltip="formatTooltip"
    :step="step"
    :min="min"
    :max="max"
    :class="sliderClass">
  </n-slider>
</template>

<script setup>
import { computed } from 'vue';
import { NSlider } from 'naive-ui';
import { getSongPlayingTime } from "@/utils/timeTools";
import { musicStore } from "@/store";

const props = defineProps({
  value: {
    type: Number,
    default: 0
  },
  duration: {
    type: Number,
    default: 0
  },
  showTooltip: {
    type: Boolean,
    default: false
  },
  tooltipContent: {
    type: String,
    default: ''
  },
  step: {
    type: Number,
    default: 0.0001
  },
  min: {
    type: Number,
    default: 0
  },
  max: {
    type: Number,
    default: 100
  },
  sliderClass: {
    type: String,
    default: ''
  },
  isProgress: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:value']);

const music = musicStore();

// 格式化tooltip内容
const formatTooltip = (value) => {
  if (props.tooltipContent) {
    return props.tooltipContent;
  }
  const time = calculateTimeFromPercentage(value);
  return getSongPlayingTime(time);
};

// 计算从百分比得到的时间
const calculateTimeFromPercentage = (percentage) => {
  return (props.duration / 100) * percentage;
};

// 获取当前播放器实例
const getPlayer = () => {
  return typeof $player !== "undefined" ? $player : null;
};

// 拖动开始事件
const onStart = () => {
  if (props.isProgress) {
    music.setPlayState(false);
  }
};

// 拖动结束事件
const onStop = () => {
  if (props.isProgress) {
    // 延迟一点点时间再开始播放，确保进度已更新
    setTimeout(() => {
      music.setPlayState(true);
    }, 10);
  }
};

// 值更新事件
const onUpdateValue = (val) => {
  // 向父组件发送更新事件
  emit('update:value', val);
  
  // 如果是进度条，直接更新播放进度
  if (props.isProgress) {
    const player = getPlayer();
    if (player && props.duration) {
      const currentTime = calculateTimeFromPercentage(val);
      
      // 1. 直接更新播放进度
      player.seek(currentTime);
      
      // 2. 直接更新store状态
      music.persistData.playSongTime.currentTime = currentTime;
    }
  }
};
</script>

<style lang="scss" scoped>
:deep(.n-slider) {
  --n-handle-size: 14px;
}

:deep(.n-slider-handle) {
  box-shadow: 0 0 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
  
  &:hover {
    transform: scale(1.1);
  }
}

:deep(.n-slider-rail) {
  border-radius: 25px;
}

:deep(.n-slider-rail__fill) {
  border-radius: 25px;
}
</style> 