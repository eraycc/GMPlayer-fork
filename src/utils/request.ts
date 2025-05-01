import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

// 声明全局变量
declare global {
  var $loadingBar: {
    start: () => void;
    finish: () => void;
    error: () => void;
  };
}

switch (process.env.NODE_ENV) {
  case "production":
    axios.defaults.baseURL = import.meta.env.VITE_MUSIC_API as string;
    break;
  case "development":
    axios.defaults.baseURL = "/api";
    break;
  default:
    axios.defaults.baseURL = import.meta.env.VITE_MUSIC_API as string;
    break;
}

axios.defaults.timeout = 30000;
axios.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";
axios.defaults.withCredentials = true;

// 自定义请求配置接口，扩展 AxiosRequestConfig
interface CustomRequestConfig extends AxiosRequestConfig {
  hiddenBar?: boolean;
}

// 请求拦截
axios.interceptors.request.use(
  (request: CustomRequestConfig) => {
    if (!request.hiddenBar && typeof $loadingBar !== "undefined")
      $loadingBar.start();
    return request;
  },
  (error: any) => {
    if (typeof $loadingBar !== "undefined") $loadingBar.error();
    console.error("请求失败，请稍后重试");
    return Promise.reject(error);
  }
);

// 响应拦截
axios.interceptors.response.use(
  (response: AxiosResponse) => {
    if (typeof $loadingBar !== "undefined") $loadingBar.finish();
    return response.data;
  },
  (error: any) => {
    if (typeof $loadingBar !== "undefined") $loadingBar.error();
    if (error.response) {
      const data = error.response.data;
      switch (error.response.status) {
        case 401:
          console.error(data.message ? data.message : "无权限访问");
          break;
        case 301:
          console.error(data.message ? data.message : "请求发生重定向");
          break;
        case 404:
          console.error(data.message ? data.message : "请求资源不存在");
          break;
        case 500:
          console.error(data.message ? data.message : "内部服务器错误");
          break;
        default:
          console.error(data.message ? data.message : "请求失败，请稍后重试");
          break;
      }
    } else {
      console.error("请求失败，请稍后重试");
    }
    return Promise.reject(error);
  }
);

export default axios; 