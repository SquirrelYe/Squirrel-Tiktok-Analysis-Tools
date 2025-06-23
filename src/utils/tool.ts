/**
 * @description 工具类
 * @author 风继续吹<will>
 * @time 2025.06.23 14:34:16
 */

// 等待操作
export function wait(ms: number) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
