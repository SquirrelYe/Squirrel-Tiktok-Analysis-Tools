/**
 * @description 元素工具类
 * @author 风继续吹<will>
 * @time 2025.06.26 11:18:46
 */

// 触发元素的鼠标进入事件
export function triggerMouseEnter(element: HTMLElement): void {
  const event = new MouseEvent('mouseenter', {
    bubbles: true,
    cancelable: true,
    relatedTarget: null
  });
  element.dispatchEvent(event);
}

// 触发元素的鼠标离开事件
export function triggerMouseLeave(element: HTMLElement): void {
  const event = new MouseEvent('mouseleave', {
    bubbles: true,
    cancelable: true,
    relatedTarget: null
  });
  element.dispatchEvent(event);
}

// 触发元素的鼠标进入事件并等待指定时间离开
export function triggerMouseEnterWithDelay(element: HTMLElement, delay: number): Promise<void> {
  return new Promise(resolve => {
    triggerMouseEnter(element);
    setTimeout(() => {
      triggerMouseLeave(element);
      resolve();
    }, delay);
  });
}
