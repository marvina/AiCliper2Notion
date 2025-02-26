// 提取页面核心内容
console.log('[内容脚本v1.2] 已加载');

function extractContent() {
  console.log('[内容脚本] 开始执行提取流程');
  console.debug('当前域名:', window.location.hostname);
  
  try {
    const title = document.title;
    const url = window.location.href;
    
    // 优先选择的CSS选择器列表
    const contentSelectors = [
      'article',
      '[itemprop="articleBody"]',
      '.post-content',
      '.article-content',
      '.content',
      '.main-content',
      '#content',
      '#article',
      '.entry-content',
      'main'
    ];

    // 查找主图片
    const mainImage = document.querySelector('meta[property="og:image"]')?.content ||
                     document.querySelector('meta[name="twitter:image"]')?.content ||
                     document.querySelector('article img')?.src || '';

    // 按优先级查找内容区域
    let mainContent = null;
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        mainContent = element;
        break;
      }
    }

    // 如果没找到任何内容区域，使用 body
    if (!mainContent) {
      mainContent = document.body;
    }

    // 清理和格式化内容
    const content = mainContent.innerText
      .replace(/[\n]{3,}/g, '\n\n')  // 清理多余空行
      .trim();

    console.log('[内容脚本] 内容提取成功:', {
      titleLength: title.length,
      contentLength: content.length,
      hasImage: !!mainImage
    });

    return {
      title: title.trim(),
      content: content.substring(0, 10000), // 限制内容长度
      image: mainImage,
      url: url.split('?')[0] // 去除URL参数
    };

  } catch (error) {
    console.error('[内容脚本] 提取失败:', error);
    return {
      title: document.title || '',
      content: '内容提取失败: ' + error.message,
      image: '',
      url: window.location.href
    };
  }
}

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[内容脚本] 收到消息:', request.action);
  
  if (request.action === 'getPageContent') {
    try {
      const content = extractContent();
      console.log('[内容脚本] 发送响应:', content ? '成功' : '失败');
      sendResponse(content);
    } catch (error) {
      console.error('[内容脚本] 处理消息时出错:', error);
      sendResponse({ error: error.message });
    }
  }
  return true;
});
