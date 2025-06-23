import { saveAs } from 'file-saver';

/**
 * @description 文件操作工具类
 * @author 风继续吹<will>
 * @time 2025.06.23 14:33:54
 */

// 保存文件
export function saveFile(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}

// 创建 Blob 对象
export function createBlobFromText(text: string, type: string = 'text/plain'): Blob {
  return new Blob([text], { type });
}

// 下载 JSON 数据
export function downloadJson(data: any, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = createBlobFromText(jsonString, 'application/json');
  saveFile(blob, filename);
}

// 下载文本文件
export function downloadTextFile(text: string, filename: string): void {
  const blob = createBlobFromText(text, 'text/plain');
  saveFile(blob, filename);
}
