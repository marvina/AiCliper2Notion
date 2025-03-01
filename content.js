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

    // 查找主图片和所有图片
    let mainImage = '';
    let allImages = [];
    
    // 检查是否是小红书页面
    if (window.location.hostname.includes('xiaohongshu.com')) {
      // 获取小红书的图片 - 改进图片提取逻辑
      console.log('[内容脚本] 检测到小红书页面，开始提取图片');
      
      // 方法1：获取轮播图中的所有图片
      const swiperImages = Array.from(document.querySelectorAll('.swiper-slide img'));
      swiperImages.forEach(img => {
        if (img.src && !img.src.includes('data:image')) {
          allImages.push(img.src);
        } else if (img.dataset.src) {
          // 处理懒加载图片
          allImages.push(img.dataset.src);
        }
      });
      
      // 方法2：获取note-content中的所有图片
      const noteContent = document.querySelector('.note-content');
      if (noteContent) {
        const contentImages = Array.from(noteContent.querySelectorAll('img'));
        contentImages.forEach(img => {
          if (img.src && !img.src.includes('data:image')) {
            allImages.push(img.src);
          } else if (img.dataset.src) {
            allImages.push(img.dataset.src);
          }
        });
      }
      
      // 方法3：查找背景图片
      const elementsWithBgImage = document.querySelectorAll('.swiper-slide, .note-content *');
      elementsWithBgImage.forEach(el => {
        const style = window.getComputedStyle(el);
        const bgImage = style.backgroundImage;
        if (bgImage && bgImage !== 'none') {
          const url = bgImage.replace(/url\(["']?([^"']*)["']?\)/g, '$1');
          if (url && !url.includes('data:image')) {
            allImages.push(url);
          }
        }
      });
      
      // 去重
      allImages = [...new Set(allImages)];
      console.log('[内容脚本] 提取到的图片数量:', allImages.length);
      
      // 设置主图片
      if (allImages.length > 0) {
        mainImage = allImages[0];
      }
    } else {
      // 非小红书页面的图片提取逻辑
      mainImage = document.querySelector('meta[property="og:image"]')?.content ||
                 document.querySelector('meta[name="twitter:image"]')?.content ||
                 document.querySelector('article img')?.src || '';
      
      if (mainImage) {
        allImages.push(mainImage);
      }
      
      // 提取页面中的所有图片
      const pageImages = Array.from(document.querySelectorAll('img'));
      pageImages.forEach(img => {
        if (img.src && !img.src.includes('data:image')) {
          allImages.push(img.src);
        } else if (img.dataset.src) {
          allImages.push(img.dataset.src);
        }
      });
      
      // 去重
      allImages = [...new Set(allImages)];
    }

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
      imageCount: allImages.length
    });

    return {
      title: title.trim(),
      content: content.substring(0, 10000), // 限制内容长度
      image: mainImage,
      images: allImages, // 返回所有图片
      url: url.split('?')[0] // 去除URL参数
    };

  } catch (error) {
    console.error('[内容脚本] 提取失败:', error);
    return {
      title: document.title || '',
      content: '内容提取失败: ' + error.message,
      image: '',
      images: [],
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
