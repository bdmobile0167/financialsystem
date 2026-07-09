import './ui.js';
async function bootstrap() {
  try {
    await import('./ui.js');
  } catch (error) {
    console.error('系統初始化失敗：', error);
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-family:sans-serif;font-size:14px;z-index:9999;line-height:1.5;';
    banner.textContent = `⚠️ 系統載入失敗，請截圖這則訊息回報：${error.message}`;
    document.body.prepend(banner);
  }
}

bootstrap();