import { build } from 'esbuild';

// 构建配置 - 保留注释和中文
build({
  entryPoints: ['src/douyin_live_replay_analyzer.ts'],
  outfile: 'app/douyin_live_replay_analyzer.js',
  bundle: true,
  platform: 'node',
  target: 'node16',
  sourcemap: true,
  minify: false, // 启用压缩
  charset: 'utf8', // 确保输出为 UTF-8 编码
  legalComments: 'inline', // 保留所有注释（包括普通注释）
  keepNames: true // 保留函数和类名
})
  .then(() => {
    console.log('构建完成，输出到 dist/douyin_live_replay_analyzer.js');
  })
  .catch(error => {
    console.error('构建失败:', error);
    process.exit(1);
  });
