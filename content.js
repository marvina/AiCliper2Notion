// 提取页面核心内容
console.log('[内容脚本v1.4] 已加载');

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

// 在文件顶部定义全局变量
let globalTempImages = [];
let globalObservedImages = new Set();

// 修改 runWhenDOMReady 函数
function runWhenDOMReady() {
  console.log("[内容脚本] DOM 加载完成，开始提取图片");
  
  // 使用全局变量
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeName === 'IMG' || (node.querySelectorAll && node.querySelectorAll('img').length > 0)) {
            const newImages = node.nodeName === 'IMG' ? [node] : Array.from(node.querySelectorAll('img'));
            newImages.forEach(async img => {
              const imgUrl = getImageUrl(img);
              if (imgUrl && !globalObservedImages.has(imgUrl)) {
                console.log("[MutationObserver] 发现新图片:", imgUrl);
                globalObservedImages.add(imgUrl);
                const loadedImg = await waitForImageLoad(img);
                if (loadedImg) {
                  console.log("[MutationObserver] 图片加载成功:", imgUrl);
                  globalTempImages.push(imgUrl);
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
    if (imgUrl && !globalObservedImages.has(imgUrl)) {
      console.log("[内容脚本] 获取到的初始图片 URL:", imgUrl);
      globalObservedImages.add(imgUrl);
      const loadedImg = await waitForImageLoad(img);
      if (loadedImg) {
        console.log("[内容脚本] 初始图片加载成功:", imgUrl);
        globalTempImages.push(imgUrl);
      }
    }
  });
}

// DOM ready check
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runWhenDOMReady);
} else {
  runWhenDOMReady(); // 如果 DOM 已经加载完成，直接执行
}

// 获取特定网站的选择器
function getPageSpecificSelectors(url) {
  if (url.includes('xiaohongshu.com') || url.includes('xhscdn.com')) {
    return {
      imageSelectors: [
        'img.note-slider-img',
        'img[data-xhs-img]'
      ],
      containerSelectors: ['.note-content', '.note-slider']
    };
  }
  
  return {
    imageSelectors: ['img'],
    containerSelectors: ['article', '[itemprop="articleBody"]', '.post-content', '.article-content', '.content', '.main-content', '#content', '#article', '.entry-content', 'main']
  };
}

// 修改现有的图片获取逻辑
async function extractContent() {
  console.log('[内容脚本] 开始执行提取流程');
  console.debug('当前域名:', window.location.hostname);
  
  try {
    const title = document.title;
    const url = window.location.href;
    
    let mainImage = '';
    let allImages = [];
    let tempImages = [];
    
    // 图片尺寸检查函数
    const checkImageSize = (imgUrl) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";

        const timeout = setTimeout(() => {
          console.log(`[内容脚本] 图片加载超时: ${imgUrl}`);
          resolve(false);
        }, 5000);

        img.onload = () => {
          clearTimeout(timeout);
          
          if (img.naturalWidth >= 800 && img.naturalHeight >= 600 && imgUrl.includes('http')) {
            console.log(`[内容脚本] 符合尺寸要求: ${imgUrl} (${img.naturalWidth}x${img.naturalHeight})`);
            resolve(true);
          } else {
            console.log(`[内容脚本] 图片尺寸不足或URL无效，已过滤: ${imgUrl} (${img.naturalWidth}x${img.naturalHeight})`);
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

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-src']
    });

    // 尝试从meta标签获取主图片
    mainImage = document.querySelector('meta[property="og:image"]')?.content ||
               document.querySelector('meta[name="twitter:image"]')?.content || '';
    
    if (mainImage) {
      console.log(`[内容脚本] 从meta标签找到主图片: ${mainImage}`);
      tempImages.push(mainImage);
    }
    
    // 获取所有图片元素
    const { imageSelectors, containerSelectors } = getPageSpecificSelectors(url);
    const allImgElements = Array.from(document.querySelectorAll(imageSelectors.join(', ')));
    console.log(`[内容脚本] 页面上找到 ${allImgElements.length} 张图片`);
    
    for (const img of allImgElements) {
      const imgUrl = getImageUrl(img);
      if (imgUrl) {
        const loadedImg = await waitForImageLoad(img);
        if (loadedImg) {
          tempImages.push(imgUrl);
        }
      }
    }

    // 去重
    tempImages = [...new Set(tempImages)];
    console.log(`[内容脚本] 收集到 ${tempImages.length} 张待验证图片`);
    
    // 修改图片收集逻辑
    // 使用全局收集的图片
    tempImages = [...globalTempImages];
    console.log('[内容脚本] 从全局变量获取的原始图片:', {
      数量: tempImages.length,
      图片列表: tempImages
    });
    
    // 小红书图片筛选逻辑
    const isXiaohongshu = /(xiaohongshu\.com|xhscdn\.com)/i.test(url);
    if (isXiaohongshu) {
      const beforeCount = tempImages.length;
      console.log('[内容脚本] 检测到小红书网站，筛选前的图片:', tempImages);
      tempImages = tempImages.filter(imgUrl => {
        // 更严格的小红书图片匹配
        const isWebpic = imgUrl.includes('sns-webpic-qc');
        if (isWebpic) {
          console.log('[内容脚本] 保留高质量图片:', imgUrl);
        } else {
          console.log('[内容脚本] 过滤低质量图片:', imgUrl);
        }
        return isWebpic;
      });
      console.log(`[内容脚本] 小红书图片筛选结果: ${beforeCount} -> ${tempImages.length}`);
      allImages = [...tempImages];
    } else {
      // 非小红书网站，进行尺寸筛选
      console.log('[内容脚本] 非小红书网站，开始尺寸筛选');
      const promises = tempImages.map(imgUrl => checkImageSize(imgUrl));
      const results = await Promise.all(promises);
      allImages = tempImages.filter((_, index) => results[index]);
      console.log('[内容脚本] 尺寸筛选后的图片数量:', allImages.length);
    }
    
    console.log('[内容脚本] 最终保留的图片:', allImages);
    
    // 去重
    allImages = [...new Set(allImages)];
    console.log('[内容脚本] 最终符合要求的图片数量:', allImages.length);
    
    // 设置主图片
    if (allImages.length > 0) {
      mainImage = allImages[0];
    }

    // 按优先级查找内容区域
    let mainContent = null;
    for (const selector of containerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        mainContent = element;
        break;
      }
    }

    if (!mainContent) {
      mainContent = document.body;
    }

    // 清理和格式化内容
    const content = mainContent.innerText
      .replace(/[\n]{3,}/g, '\n\n')
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
// 修改消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[内容脚本] 收到消息:', request.action);
  
  if (request.action === 'getPageContent') {
    // 添加延迟等待图片收集
    setTimeout(() => {
      extractContent().then(content => {
        console.log('[内容脚本] 发送响应:', content ? '成功' : '失败');
        sendResponse(content);
      }).catch(error => {
        console.error('[内容脚本] 处理消息时出错:', error);
        sendResponse({ error: error.message });
      });
    }, 2000); // 等待2秒让图片收集完成
    
    return true;
  }
  return true;
});

// 获取所有图片元素
function getAllImages() {
  const images = [];
  
  function* traverseAllElements(node) {
    yield node;
    for (const child of node.children) {
      yield* traverseAllElements(child);
    }
  }

  for (const element of traverseAllElements(document.body)) {
    if (element.tagName === 'IMG') {
      images.push(element);
    }
  }
  
  return images;
}

const allImgElements = getAllImages();

// 处理小红书图片 URL
function processXiaohongshuImageUrl(url) {
  return url; // 这里可以添加特定处理逻辑
}

// 获取小红书图片
function getXiaohongshuImages() {
  return Array.from(document.querySelectorAll(`
    img.note-content-emoji, 
    img.note-slider-img, 
    img[data-xhs-img]
  `)).map(img => img.src);
}
