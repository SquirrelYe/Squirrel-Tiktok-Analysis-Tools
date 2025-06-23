import { utils, writeFile } from 'xlsx';

/**
 * @description Excel 文件操作工具类
 * @author 风继续吹<will>
 * @time 2025.06.23 14:34:01
 */

// 导出数据到Excel文件
export function exportToExcel(data: any[], filename: string): void {
  const worksheet = utils.json_to_sheet(data);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  writeFile(workbook, filename);
}

// 创建多个工作表的Excel文件
export function exportMultipleSheetsToExcel(data: Record<string, any[]>, filename: string): void {
  const workbook = utils.book_new();
  Object.keys(data).forEach(sheetName => {
    const worksheet = utils.json_to_sheet(data[sheetName]);
    utils.book_append_sheet(workbook, worksheet, sheetName);
  });
  writeFile(workbook, filename);
}
