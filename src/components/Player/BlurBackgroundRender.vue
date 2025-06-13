<template>
  <div ref="wrapperRef" v-bind="$attrs"></div>
</template>

<script setup lang="ts">
// 基于 @applemusic-like-lyrics/core 来实现模糊效果的 WebGL 渲染
import {
  AbstractBaseRenderer,
  BaseRenderer
} from "@applemusic-like-lyrics/core";
import { ref, onMounted, onUnmounted, watch, defineExpose, computed } from "vue";

// 创建专门的模糊效果 WebGL 渲染器
class BlurGradientRenderer extends BaseRenderer {
  private texture: WebGLTexture | null = null;
  private image = new Image();
  private loaded = false;
  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private locations: Record<string, number | WebGLUniformLocation> = {};
  private blurAmount = 30.0; // 模糊程度
  private contrast = 1.2;    // 对比度
  private time = 0;
  private lastFrameTime = 0;
  private isPlaying = true;
  private fpsValue = 30;
  private isStatic = false;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.initShaders();
    this.initBuffers();
  }

  // 实现 BaseRenderer 所需方法
  setStaticMode(isStatic: boolean): void {
    this.isStatic = isStatic;
  }

  setFPS(fps: number): void {
    this.fpsValue = fps;
  }

  pause(): void {
    this.isPlaying = false;
  }

  resume(): void {
    this.isPlaying = true;
  }

  // 由于 gl 不直接暴露，我们使用 getGL 方法
  private getGL(): WebGLRenderingContext | null {
    return this.canvas ? this.canvas.getContext('webgl') : null;
  }

  private initShaders() {
    const gl = this.getGL();
    if (!gl) return;

    // 顶点着色器
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) return;

    gl.shaderSource(
      vertexShader,
      `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0, 1);
        v_texCoord = a_texCoord;
      }
      `
    );
    gl.compileShader(vertexShader);

    // 片段着色器 - 实现高斯模糊
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) return;

    gl.shaderSource(
      fragmentShader,
      `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform float u_blurAmount;
      uniform float u_contrast;
      uniform float u_time;
      
      // 高斯模糊实现
      vec4 blur(sampler2D image, vec2 uv, float blur) {
        // 高斯模糊参数
        float pi = 3.14159265359;
        float directions = 16.0;
        float quality = 4.0;
        
        vec4 color = vec4(0.0);
        // 通过多个方向的采样实现模糊效果
        for(float d = 0.0; d < pi * 2.0; d += pi * 2.0 / directions) {
          for(float i = 1.0 / quality; i <= 1.0; i += 1.0 / quality) {
            // 偏移量根据时间轻微变化，增加动态效果
            float offset = (sin(u_time * 0.05) * 0.01 + 1.0) * blur * i;
            color += texture2D(image, uv + vec2(cos(d) * offset, sin(d) * offset));
          }
        }
        
        // 平均采样颜色
        color /= quality * directions;
        
        // 应用对比度
        color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;
        
        return color;
      }
      
      void main() {
        // 移动 UV 坐标，创建漂浮效果
        vec2 uv = v_texCoord;
        uv += vec2(sin(u_time * 0.01) * 0.01, cos(u_time * 0.01) * 0.01);
        
        // 应用模糊效果
        vec4 color = blur(u_image, uv, u_blurAmount / 100.0);
        
        // 输出颜色
        gl_FragColor = color;
      }
      `
    );
    gl.compileShader(fragmentShader);

    // 创建着色器程序
    const program = gl.createProgram();
    if (!program) return;
    
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);
    
    this.program = program;

    // 获取属性和统一变量位置
    this.locations = {
      position: gl.getAttribLocation(program, 'a_position'),
      texCoord: gl.getAttribLocation(program, 'a_texCoord'),
      image: gl.getUniformLocation(program, 'u_image') as WebGLUniformLocation,
      blurAmount: gl.getUniformLocation(program, 'u_blurAmount') as WebGLUniformLocation,
      contrast: gl.getUniformLocation(program, 'u_contrast') as WebGLUniformLocation,
      time: gl.getUniformLocation(program, 'u_time') as WebGLUniformLocation
    };
  }

  private initBuffers() {
    const gl = this.getGL();
    if (!gl) return;

    // 创建位置缓冲区
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    
    // 定义一个覆盖整个画布的矩形
    const positions = [
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ];
    
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    this.positionBuffer = positionBuffer;

    // 创建纹理坐标缓冲区
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    
    // 定义纹理坐标
    const texCoords = [
      0, 0,
      1, 0,
      0, 1,
      1, 1
    ];
    
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
    this.texCoordBuffer = texCoordBuffer;
  }

  setImage(url: string) {
    this.loaded = false;
    this.image.crossOrigin = "anonymous";
    this.image.onload = () => {
      this.loaded = true;
      this.createTexture();
    };
    this.image.src = url;
  }

  private createTexture() {
    const gl = this.getGL();
    if (!gl || !this.loaded) return;

    // 创建纹理
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // 设置参数，使纹理能够处理非2的幂尺寸的图像
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // 上传图像数据到纹理
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);

    this.texture = texture;
  }

  setBlurAmount(amount: number) {
    this.blurAmount = amount;
  }

  setContrast(contrast: number) {
    this.contrast = contrast;
  }

  render(currentTime: number) {
    if (!this.isPlaying || this.isStatic) return;
    
    const gl = this.getGL();
    if (!gl || !this.program || !this.texture || !this.loaded) return;

    // 计算时间增量
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = currentTime;
    }
    
    // 更新时间，用于动画效果
    this.time += (currentTime - this.lastFrameTime) * 0.01;
    this.lastFrameTime = currentTime;

    // 设置视口和清除
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 使用着色器程序
    gl.useProgram(this.program);

    // 设置位置属性
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.locations.position as number);
    gl.vertexAttribPointer(this.locations.position as number, 2, gl.FLOAT, false, 0, 0);

    // 设置纹理坐标属性
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(this.locations.texCoord as number);
    gl.vertexAttribPointer(this.locations.texCoord as number, 2, gl.FLOAT, false, 0, 0);

    // 设置纹理
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.locations.image as WebGLUniformLocation, 0);

    // 设置统一变量
    gl.uniform1f(this.locations.blurAmount as WebGLUniformLocation, this.blurAmount);
    gl.uniform1f(this.locations.contrast as WebGLUniformLocation, this.contrast);
    gl.uniform1f(this.locations.time as WebGLUniformLocation, this.time);

    // 绘制
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    const gl = this.getGL();
    if (!gl) return;

    // 清理资源
    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }

    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }

    if (this.positionBuffer) {
      gl.deleteBuffer(this.positionBuffer);
      this.positionBuffer = null;
    }

    if (this.texCoordBuffer) {
      gl.deleteBuffer(this.texCoordBuffer);
      this.texCoordBuffer = null;
    }

    // 调用父类的 dispose 方法
    super.dispose();
  }
  
  // 额外需要实现的方法
  setHasLyric(_: boolean): void {}
  setRenderScale(_: number): void {}
  setLowFreqVolume(_: number): void {}
  async setAlbum(url: string | HTMLImageElement | HTMLVideoElement, isVideo?: boolean): Promise<void> {
    if (typeof url === 'string') {
      this.setImage(url);
    }
    return Promise.resolve();
  }
  setFlowSpeed(_: number): void {}
  getElement(): HTMLCanvasElement {
    return this.canvas;
  }
}

interface BlurBackgroundRenderProps {
  album?: string;
  fps?: number;
  playing?: boolean;
  blurAmount?: number;
  contrast?: number;
  renderScale?: number;
}

const props = withDefaults(defineProps<BlurBackgroundRenderProps>(), {
  playing: true,
  blurAmount: 30,
  contrast: 1.2,
  renderScale: 0.5,
  fps: 30
});

const renderer = ref<BlurGradientRenderer | null>(null);
const wrapperRef = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const animationFrame = ref<number | null>(null);
const lastRenderTime = ref<number>(0);

// 格式化专辑图片URL，确保使用HTTPS
const formattedAlbumUrl = computed(() => {
  if (!props.album) return '';
  return props.album.replace(/^http:/, 'https:');
});

// 渲染函数
const render = (timestamp: number) => {
  if (!renderer.value || !props.playing) return;
  
  // 基于FPS控制渲染频率
  const frameInterval = 1000 / props.fps;
  const elapsed = timestamp - lastRenderTime.value;
  
  if (elapsed > frameInterval) {
    lastRenderTime.value = timestamp - (elapsed % frameInterval);
    renderer.value.render(timestamp);
  }
  
  animationFrame.value = requestAnimationFrame(render);
};

// 启动渲染
const start = () => {
  if (animationFrame.value) cancelAnimationFrame(animationFrame.value);
  animationFrame.value = requestAnimationFrame(render);
};

// 停止渲染
const stop = () => {
  if (animationFrame.value) {
    cancelAnimationFrame(animationFrame.value);
    animationFrame.value = null;
  }
};

// 调整画布大小
const resizeCanvas = () => {
  if (!canvas.value || !wrapperRef.value) return;
  
  const scale = props.renderScale;
  const width = wrapperRef.value.clientWidth * scale;
  const height = wrapperRef.value.clientHeight * scale;
  
  canvas.value.width = width;
  canvas.value.height = height;
  canvas.value.style.width = '100%';
  canvas.value.style.height = '100%';
};

// 初始化渲染器
const initRenderer = () => {
  if (!canvas.value) return;
  
  renderer.value = new BlurGradientRenderer(canvas.value);
  
  if (props.album) {
    renderer.value.setImage(formattedAlbumUrl.value);
  }
  
  renderer.value.setBlurAmount(props.blurAmount);
  renderer.value.setContrast(props.contrast);
  
  // 根据播放状态开始/停止渲染
  if (props.playing) {
    start();
  }
};

onMounted(() => {
  // 创建画布
  canvas.value = document.createElement('canvas');
  canvas.value.style.width = '100%';
  canvas.value.style.height = '100%';
  canvas.value.style.display = 'block';
  
  if (wrapperRef.value) {
    wrapperRef.value.appendChild(canvas.value);
  }
  
  // 调整大小并初始化
  resizeCanvas();
  initRenderer();
  
  // 监听窗口大小变化
  window.addEventListener('resize', resizeCanvas);
});

onUnmounted(() => {
  stop();
  renderer.value?.dispose();
  window.removeEventListener('resize', resizeCanvas);
});

// 监听属性变化
watch(() => props.album, (newValue) => {
  if (newValue && renderer.value) {
    renderer.value.setImage(formattedAlbumUrl.value);
  }
});

watch(() => props.blurAmount, (newValue) => {
  if (typeof newValue !== 'undefined' && renderer.value) {
    renderer.value.setBlurAmount(newValue);
  }
});

watch(() => props.contrast, (newValue) => {
  if (typeof newValue !== 'undefined' && renderer.value) {
    renderer.value.setContrast(newValue);
  }
});

watch(() => props.playing, (newValue) => {
  if (newValue) {
    start();
  } else {
    stop();
  }
});

watch(() => props.renderScale, () => {
  resizeCanvas();
});

// 暴露方法和属性给父组件
defineExpose({
  wrapperEl: wrapperRef,
  renderer,
  start,
  stop
});
</script> 