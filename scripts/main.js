async function bootstrap() {
  try {
    await import('./ui.js');
  } catch (error) {
    console.error('App bootstrap failed:', error);
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px 16px;font-family:sans-serif;font-size:14px;z-index:9999;line-height:1.5;';
    banner.textContent = 'App bootstrap failed. Please refresh or contact an administrator: ' + error.message;
    document.body.prepend(banner);
  }
}

bootstrap();
