// 提取页面核心内容
console.log('[内容脚本v1.4] 已加载');

// Move utility functions to the top level
// 获取图片URL的函数
function getImageUrl(imgElement) {
  console.log("[内容脚本] 发现图片元素：", imgElement);

  const url = imgElement.src || 
            imgElement.dataset.src || 
            imgElement.getAttribute('data-src') ||
            imgElement.getAttribute('data-lazy-src') ||
            imgElement.getAttribute('data-original') ||
            imgElement.currentSrc;
  console.log("[内容脚本] 提取到的 URL：", url);
  
  if (url && !url.startsWith('data:')) {
    return url;
  }
  
  const style = window.getComputedStyle(imgElement);
  const bgImage = style.backgroundImage;
  if (bgImage && bgImage !== 'none') {
    return bgImage.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
  }
  
  return null;
}

// 等待图片加载的函数
function waitForImageLoad(imgElement) {
  return new Promise(resolve => {
    if (imgElement.complete) {
      resolve(imgElement);
    } else {
      imgElement.onload = () => resolve(imgElement);
      imgElement.onerror = () => resolve(null);
    }
  });
}

// Add runWhenDOMReady function definition before its usage
function runWhenDOMReady() {
  console.log("[内容脚本] DOM 加载完成，开始提取图片");
  
  // 初始化图片集合
  let observedImages = new Set();
  let tempImages = [];  // 添加tempImages声明
  
  // 修改 MutationObserver 的处理逻辑
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeName === 'IMG' || (node.querySelectorAll && node.querySelectorAll('img').length > 0)) {
            const newImages = node.nodeName === 'IMG' ? [node] : Array.from(node.querySelectorAll('img'));
            newImages.forEach(async img => {
              const imgUrl = getImageUrl(img);
              if (imgUrl && !observedImages.has(imgUrl)) {
                console.log("[MutationObserver] 发现新图片:", imgUrl);
                observedImages.add(imgUrl);
                const loadedImg = await waitForImageLoad(img);
                if (loadedImg) {
                  console.log("[MutationObserver] 图片加载成功:", imgUrl);
                  tempImages.push(imgUrl);
                }
              }
            });
          }
        });
      }
    });
  });

  // 配置和启动观察器
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'data-src', 'data-original']
  });

  // 立即获取当前页面的所有图片
  document.querySelectorAll("img").forEach(async img => {
    const imgUrl = getImageUrl(img);
    if (imgUrl && !observedImages.has(imgUrl)) {
      console.log("[内容脚本] 获取到的初始图片 URL:", imgUrl);
      observedImages.add(imgUrl);
      const loadedImg = await waitForImageLoad(img);
      if (loadedImg) {
        console.log("[内容脚本] 初始图片加载成功:", imgUrl);
        tempImages.push(imgUrl);
      }
    }
  });
}

// Move DOM ready check after function definition
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runWhenDOMReady);
} else {
  runWhenDOMReady(); // 如果 DOM 已经加载完成，直接执行
}

// 修改为异步函数
// 在 extractContent 函数顶部添加
function getPageSpecificSelectors(url) {
  // 小红书特定适配（与现有逻辑保持兼容）
  if (url.includes('xiaohongshu.com') || url.includes('xhscdn.com')) {
    return {
      imageSelectors: [
        'img.note-slider-img',
        'img[data-xhs-img]'
      ],
      containerSelectors: ['.note-content', '.note-slider']
    };
  }
  
  // 保持现有内容选择器逻辑
  return {
    imageSelectors: ['img'],
    containerSelectors: contentSelectors // 使用已有的 contentSelectors 数组
  };
}

// 修改现有的图片获取逻辑
async function extractContent() {
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
    let tempImages = [];
    
    // 改进的图片尺寸检查函数
    const checkImageSize = (imgUrl) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";

        // 设置超时
        const timeout = setTimeout(() => {
          console.log(`[内容脚本] 图片加载超时: ${imgUrl}`);
          resolve(false);
        }, 5000);

        img.onload = () => {
          clearTimeout(timeout);
          
          if (img.naturalWidth >= 800 && img.naturalHeight >= 600) {
            console.log(`[内容脚本] 符合尺寸要求: ${imgUrl} (${img.naturalWidth}x${img.naturalHeight})`);
            resolve(true);
          } else {
            console.log(`[内容脚本] 图片过小，丢弃: ${imgUrl} (${img.naturalWidth}x${img.naturalHeight})`);
            resolve(false);
          }
        };

        img.onerror = () => {
          clearTimeout(timeout);
          console.log(`[内容脚本] 图片加载失败，丢弃: ${imgUrl}`);
          resolve(false);
        };

        img.src = imgUrl + (imgUrl.includes('?') ? '&' : '?') + 'nocache=' + Date.now();
      });
    };

    // 获取图片URL的函数
    // 在getImageUrl函数中添加更多懒加载属性检测
    function getImageUrl(imgElement) {
      console.log("[内容脚本] 发现图片元素：", imgElement);  // 🔥 打印 img 详细信息

      // 添加更多常见懒加载属性
      const url = imgElement.src || 
                imgElement.dataset.src || 
                imgElement.getAttribute('data-src') ||
                imgElement.getAttribute('data-lazy-src') || // 新增常见懒加载属性
                imgElement.getAttribute('data-original') ||  // 新增常见懒加载属性
                imgElement.currentSrc;
       console.log("[内容脚本] 提取到的 URL：", url);  // 🔥 打印最终获取到的 URL
      // 过滤掉data:URI
      if (url && !url.startsWith('data:')) {
        return url;
      }
      
      // 如果图片在CSS背景中
      const style = window.getComputedStyle(imgElement);
      const bgImage = style.backgroundImage;
      if (bgImage && bgImage !== 'none') {
        return bgImage.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
      }
      
      return null;
    }

    // 等待图片加载的函数
    function waitForImageLoad(imgElement) {
      return new Promise(resolve => {
        if (imgElement.complete) {
          resolve(imgElement);
        } else {
          imgElement.onload = () => resolve(imgElement);
          imgElement.onerror = () => resolve(null);
        }
      });
    }

    // 使用正则表达式提取所有可能的图片URL
    function extractAllImageUrls() {
      const html = document.documentElement.outerHTML;
      const imgRegex = /https?:\/\/[^"']+\.(jpe?g|png|gif|webp|svg)(\?[^"']*)?/gi;
      return [...new Set(Array.from(html.matchAll(imgRegex), m => m[0]))];
    }

    // 设置MutationObserver监听DOM变化
    let observedImages = new Set();
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.addedNodes) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeName === 'IMG' || (node.querySelectorAll && node.querySelectorAll('img').length > 0)) {
              const newImages = node.nodeName === 'IMG' ? [node] : Array.from(node.querySelectorAll('img'));
              newImages.forEach(async img => {
                const imgUrl = getImageUrl(img);
                if (imgUrl && !observedImages.has(imgUrl)) {
                  observedImages.add(imgUrl);
                  const loadedImg = await waitForImageLoad(img);
                  if (loadedImg) {
                    tempImages.push(imgUrl);
                  }
                }
              });
            }
          });
        }
      });
    });

    // 修改MutationObserver配置以监听属性变化
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true, // 新增属性变化监听
      attributeFilter: ['src', 'data-src'] // 监听这些属性的变化
    });

    // 尝试从meta标签获取主图片
    mainImage = document.querySelector('meta[property="og:image"]')?.content ||
               document.querySelector('meta[name="twitter:image"]')?.content || '';
    
    if (mainImage) {
      console.log(`[内容脚本] 从meta标签找到主图片: ${mainImage}`);
      tempImages.push(mainImage);
    }
    
    // 获取所有图片元素（修复重复声明）
    const { imageSelectors, containerSelectors } = getPageSpecificSelectors(url);
    const allImgElements = Array.from(document.querySelectorAll(imageSelectors.join(', ')));
    console.log(`[内容脚本] 页面上找到 ${allImgElements.length} 张图片`);
    
    // 处理所有图片元素
    for (const img of allImgElements) {
      const imgUrl = getImageUrl(img);
      if (imgUrl) {
        const loadedImg = await waitForImageLoad(img);
        if (loadedImg) {
          tempImages.push(imgUrl);
        }
      }
    }
  
    // 删除重复的声明和获取
    let mainContent = null;
    for (const selector of containerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        mainContent = element;
        break;
      }
    }
  
    // Remove this incorrect return statement
    // return { imageSelectors: ['img'], containerSelectors: ['body'] };

    // 提取页面中所有可能的图片URL
    const additionalUrls = extractAllImageUrls();
    tempImages.push(...additionalUrls);
    
    // 去重
    tempImages = [...new Set(tempImages)];
    console.log(`[内容脚本] 收集到 ${tempImages.length} 张待验证图片`);
    
    // 检查所有图片尺寸
    for (const imgUrl of tempImages) {
      try {
        const isValidSize = await checkImageSize(imgUrl);
        if (isValidSize) {
          allImages.push(imgUrl);
        }
      } catch (error) {
        console.error(`[内容脚本] 尺寸检查失败: ${imgUrl}`, error);
      }
    }

    // 清理观察器
    observer.disconnect();
    
    // 去重
    allImages = [...new Set(allImages)];
    console.log('[内容脚本] 最终符合尺寸要求的图片数量:', allImages.length);
    
    // 设置主图片
    if (allImages.length > 0) {
      mainImage = allImages[0];
    }

    // 按优先级查找内容区域
    // Remove the second declaration and just reuse the existing mainContent variable
    // Remove: let mainContent = null;
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
      content: content.substring(0, 10000),
      image: mainImage,
      images: allImages,
      url: url.split('?')[0]
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

// 修改消息监听器以支持异步
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[内容脚本] 收到消息:', request.action);
  
  if (request.action === 'getPageContent') {
    // 使用异步处理
    extractContent().then(content => {
      console.log('[内容脚本] 发送响应:', content ? '成功' : '失败');
      sendResponse(content);
    }).catch(error => {
      console.error('[内容脚本] 处理消息时出错:', error);
      sendResponse({ error: error.message });
    });
    
    return true; // 表示会异步发送响应
  }
  return true;
});
