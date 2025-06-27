/**
 * @description DOM工具类
 * @author 风继续吹<will>
 * @time 2025.06.26 16:36:08
 */

// 解析HTML字符串为DOM元素
export function parseHTML(html: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc;
}

// 获取元素的文本内容
export function getElementText(doc: Document, selector: string): string {
  const element = doc.querySelector(selector) as HTMLElement | null;
  return element ? element.textContent || element.innerText || '' : '';
}
