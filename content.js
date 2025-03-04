// 提取页面核心内容
console.log('[内容脚本v1.5] 已加载 - 增强图片筛选日志');

// 获取图片URL的函数
function getImageUrl(imgElement) {
  const url = imgElement.src || 
            imgElement.dataset.src || 
            imgElement.getAttribute('data-src') ||
            imgElement.getAttribute('data-lazy-src') ||
            imgElement.getAttribute('data-original') ||
            imgElement.currentSrc;
  
  if (url && !url.startsWith('data:')) {
    console.log("[内容脚本] 提取到有效图片 URL:", url);
    return url;
  }
  
  const style = window.getComputedStyle(imgElement);
  const bgImage = style.backgroundImage;
  if (bgImage && bgImage !== 'none') {
    const extractedUrl = bgImage.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
    console.log("[内容脚本] 从背景提取到图片 URL:", extractedUrl);
    return extractedUrl;
  }
  
  return null;
}

// 等待图片加载的函数
function waitForImageLoad(imgElement) {
  return new Promise(resolve => {
    if (imgElement.complete) {
      console.log("[内容脚本] 图片已完成加载:", imgElement.src);
      resolve(imgElement);
    } else {
      console.log("[内容脚本] 等待图片加载:", imgElement.src);
      imgElement.onload = () => {
        console.log("[内容脚本] 图片加载成功:", imgElement.src);
        resolve(imgElement);
      };
      imgElement.onerror = () => {
        console.log("[内容脚本] 图片加载失败:", imgElement.src);
        resolve(null);
      };
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
    console.log("[内容脚本] DOM 变化检测到 " + mutations.length + " 个变化");
    
    mutations.forEach(mutation => {
      if (mutation.addedNodes) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeName === 'IMG' || (node.querySelectorAll && node.querySelectorAll('img').length > 0)) {
            const newImages = node.nodeName === 'IMG' ? [node] : Array.from(node.querySelectorAll('img'));
            console.log("[内容脚本] 发现新增图片元素:", newImages.length, "个");
            
            newImages.forEach(async img => {
              const imgUrl = getImageUrl(img);
              if (imgUrl && !globalObservedImages.has(imgUrl)) {
                console.log("[MutationObserver] 发现新图片:", imgUrl);
                globalObservedImages.add(imgUrl);
                const loadedImg = await waitForImageLoad(img);
                if (loadedImg) {
                  console.log("[MutationObserver] 图片加载成功，添加到全局列表:", imgUrl);
                  globalTempImages.push(imgUrl);
                  console.log("[内容脚本] 当前全局图片数量:", globalTempImages.length);
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
  console.log("[内容脚本] MutationObserver 已启动");

  // 立即获取当前页面的所有图片
  const initialImages = document.querySelectorAll("img");
  console.log("[内容脚本] 页面初始图片数量:", initialImages.length);
  
  initialImages.forEach(async img => {
    const imgUrl = getImageUrl(img);
    if (imgUrl && !globalObservedImages.has(imgUrl)) {
      console.log("[内容脚本] 获取到的初始图片 URL:", imgUrl);
      globalObservedImages.add(imgUrl);
      const loadedImg = await waitForImageLoad(img);
      if (loadedImg) {
        console.log("[内容脚本] 初始图片加载成功，添加到全局列表:", imgUrl);
        globalTempImages.push(imgUrl);
        console.log("[内容脚本] 当前全局图片数量:", globalTempImages.length);
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
    console.log("[内容脚本] 检测到小红书网站，使用特定选择器");
    return {
      imageSelectors: [
        'img.note-slider-img',
        'img[data-xhs-img]'
      ],
      containerSelectors: ['.note-content', '.note-slider']
    };
  }
  
  console.log("[内容脚本] 使用通用选择器");
  return {
    imageSelectors: ['img'],
    containerSelectors: ['article', '[itemprop="articleBody"]', '.post-content', '.article-content', '.content', '.main-content', '#content', '#article', '.entry-content', 'main']
  };
}

// 修改现有的图片获取逻辑
async function extractContent() {
  console.log('[内容脚本] 进入 extractContent');
  console.log('globalTempImages:', globalTempImages);
  
  console.debug('当前域名:', window.location.hostname);
  const url = window.location.href;
  const isXiaohongshu = /(xiaohongshu\.com|xhscdn\.com)/i.test(url);
  console.log('isXiaohongshu:', isXiaohongshu);
  
  // 创建一个日志收集器
  const logs = [];
  function log(message) {
    const logMessage = `[内容脚本] ${message}`;
    logs.push(logMessage);
    console.log(logMessage);
  }
  
  try {
    // 添加调试信息
    log(`全局图片数组状态: 长度=${globalTempImages.length}, 是否为数组=${Array.isArray(globalTempImages)}`);
    if (globalTempImages.length > 0) {
      log(`全局图片示例: ${globalTempImages[0]}`);
    }
    
    const title = document.title;
    
    log(`处理页面: ${title} (${url})`);
    
    let mainImage;
    let allImages = [];
    let tempImages = [];
    
    // 图片尺寸检查函数
    const checkImageSize = (imgUrl) => {
      return new Promise((resolve) => {
        log(`检查图片尺寸: ${imgUrl}`);
        const img = new Image();
        img.crossOrigin = "Anonymous";

        const timeout = setTimeout(() => {
          log(`图片加载超时: ${imgUrl}`);
          resolve(false);
        }, 5000);

        img.onload = () => {
          clearTimeout(timeout);
          
          if (img.naturalWidth >= 800 && img.naturalHeight >= 600 && imgUrl.includes('http')) {
            log(`符合尺寸要求: ${imgUrl} (${img.naturalWidth}x${img.naturalHeight})`);
            resolve(true);
          } else {
            log(`图片尺寸不足或URL无效: ${imgUrl} (${img.naturalWidth}x${img.naturalHeight})`);
            resolve(false);
          }
        };

        img.onerror = () => {
          clearTimeout(timeout);
          log(`图片加载失败: ${imgUrl}`);
          resolve(false);
        };

        img.src = imgUrl + (imgUrl.includes('?') ? '&' : '?') + 'nocache=' + Date.now();
      });
    };
    
    // 使用全局收集的图片
    log(`全局收集的图片数量: ${globalTempImages.length}`);
    
    // 确保有图片可以筛选
    if (globalTempImages.length === 0) {
      log('全局图片为空，尝试直接从页面获取图片');
      // 直接从页面获取图片
      const allImgs = document.querySelectorAll('img');
      log(`页面上找到 ${allImgs.length} 张图片`);
      
      for (const img of allImgs) {
        const imgUrl = img.src || img.dataset?.src || img.getAttribute('data-src');
        if (imgUrl && !imgUrl.startsWith('data:') && imgUrl.includes('http')) {
          log(`直接添加图片: ${imgUrl}`);
          tempImages.push(imgUrl);
        }
      }
      
      log(`直接从页面获取到 ${tempImages.length} 张图片`);
    } else {
      log('使用全局收集的图片');
      tempImages = [...globalTempImages];
    }
    
    // 确保有图片可以筛选
    if (tempImages.length === 0) {
      log('警告: 没有找到任何图片可以筛选!');
      
      // 尝试从 meta 标签获取
      const metaImage = document.querySelector('meta[property="og:image"]')?.content ||
                        document.querySelector('meta[name="twitter:image"]')?.content;
      if (metaImage) {
        log(`从 meta 标签找到图片: ${metaImage}`);
        tempImages.push(metaImage);
      }
      
      // 尝试从正则匹配获取
      const htmlString = document.documentElement.outerHTML;
      const imgRegex = /https?:\/\/[^"']+\.(jpe?g|png|gif|webp)(\?[^"']*)?/gi;
      const regexMatches = htmlString.match(imgRegex) || [];
      
      if (regexMatches.length > 0) {
        log(`通过正则表达式找到 ${regexMatches.length} 张图片`);
        tempImages.push(...regexMatches);
      }
    }
    
    log(`筛选前的图片总数: ${tempImages.length}`);
    
    // 小红书图片筛选逻辑
    if (isXiaohongshu) {
      log('检测到小红书网站，使用小红书筛选逻辑');
      const beforeCount = tempImages.length;
      
      log('开始筛选小红书图片...');
      
      let keptCount = 0;
      let filteredCount = 0;
      
      tempImages = tempImages.filter(imgUrl => {
        // 更严格的小红书图片匹配
        const isWebpic = imgUrl.includes('sns-webpic-qc');
        if (isWebpic) {
          log(`✅ [${++keptCount}] 保留高质量图片: ${imgUrl}`);
          return true;
        } else {
          log(`❌ [${++filteredCount}] 过滤低质量图片: ${imgUrl}`);
          return false;
        }
      });
      
      log(`小红书图片筛选完成: 保留 ${keptCount}张，过滤 ${filteredCount}张`);
      allImages = [...tempImages];
    } else {
      // 非小红书网站，进行尺寸筛选
      log('非小红书网站，使用尺寸筛选逻辑');
      
      let passedCount = 0;
      let failedCount = 0;
      
      // 在尺寸检查循环中添加
      log(`开始尺寸检查，总图片数: ${tempImages.length}`);
      
      // 逐个检查图片尺寸
      for (let i = 0; i < tempImages.length; i++) {
        const imgUrl = tempImages[i];
        console.log('[同步日志] 处理图片:', imgUrl); // 同步日志
        log(`检查图片 #${i+1}/${tempImages.length} 尺寸: ${imgUrl}`);
        
let imageUrl; // 确保变量声明在使用前
try {
  imageUrl = imgUrl; // 明确初始化
  const result = await checkImageSize(imageUrl);

  if (result) {
    log(`✅ [${++passedCount}] 图片通过尺寸检查: ${imageUrl}`);
    allImages.push(imageUrl);
  } else {
    log(`❌ [${++failedCount}] 图片未通过尺寸检查: ${imageUrl}`);
        }
      } catch (error) {
  log(`图片处理失败: ${imageUrl} (${error.message})`);
}
      }
      
      log(`尺寸筛选完成: 通过 ${passedCount}张，失败 ${failedCount}张`);
    }
    
    log(`最终保留的图片数量: ${allImages.length}`);
    
    // 去重
    const beforeFinalDedup = allImages.length;
    allImages = [...new Set(allImages)];
    log(`最终去重: ${beforeFinalDedup} -> ${allImages.length} 张图片`);
    
    // 更新主图片（此时仅记录候选图片）
    if (allImages.length > 0) {
      // 不立即设置主图片，而是标记待上传状态
      log(`候选主图片: ${allImages[0]}`);
      mainImage = ''; // 使用已声明的变量，不重新声明
    }

    // 按优先级查找内容区域
    const { containerSelectors } = getPageSpecificSelectors(url);
    log(`使用的内容选择器: ${containerSelectors.join(', ')}`);
    
    let mainContent = null;
    for (const selector of containerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        log(`找到内容区域: ${selector}`);
        mainContent = element;
        break;
      }
    }

    if (!mainContent) {
      log('未找到特定内容区域，尝试使用 Readability');
      try {
        const documentClone = document.cloneNode(true);
        const reader = new Readability(documentClone);
        const article = reader.parse();
        
        if (article) {
          log('Readability 解析成功');
          mainContent = document.createElement('div');
          mainContent.innerHTML = article.content;
        } else {
          log('Readability 解析失败，使用 body');
          mainContent = document.body;
        }
      } catch (error) {
        log(`Readability 处理出错: ${error.message}，使用 body`);
      mainContent = document.body;
      }
    }

    // 清理和格式化内容
    const content = mainContent.innerText
      .replace(/[\n]{3,}/g, '\n\n')
      .replace(/https?:\/\/[^\s]+/g, '') // 移除所有URL
      .replace(/\[链接已移除:[^\]]+\]/g, '') // 移除之前的链接标记
      .trim();

    // 修改 Markdown 内容处理逻辑
    const contentMarkdown = content
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        // 移除所有URL
        line = line.replace(/https?:\/\/[^\s]+/g, '');
        
        // 简单的标题检测
        if (/^[#]{1,6}\s/.test(line)) {
          return line;
        }
        // 检测是否为标题（全行文本较短且没有标点符号）
        if (line.length < 40 && !/[,.;:!?]/.test(line)) {
          return `## ${line}`;
        }
        return line;
      })
      .join('\n\n');

    log(`内容提取成功: 标题长度=${title.length}, 内容长度=${content.length}, 图片数量=${allImages.length}`);

    // 将所有日志合并为一个字符串
    const logSummary = logs.join('\n');

    return {
      title: title.trim(),
      content: content.substring(0, 10000),
      contentMarkdown: contentMarkdown.substring(0, 10000),
      image: mainImage,
      images: allImages,
      pendingMainImage: allImages.length > 0 ? allImages[0] : '', // 添加候选主图片字段
      url: url.split('?')[0],
      imageFilterLog: logSummary
    };

  } catch (error) {
    console.error('[内容脚本] 提取失败:', error);
    return {
      title: document.title || '',
      content: '内容提取失败: ' + error.message,
      contentMarkdown: '',
      image: '',
      images: [],
      url: window.location.href,
      imageFilterLog: `提取失败: ${error.message}\n${logs.join('\n')}`
    };
  }
}

// 修改消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[内容脚本] 收到消息:', request.action);
  
  if (request.action === 'getPageContent') {
    const detailedLogs = [];
    
    function addLog(message) {
      const logMessage = `[内容脚本] ${message}`;
      detailedLogs.push(logMessage);
      console.log(logMessage);
    }
    
    addLog('开始处理 getPageContent 请求');
    addLog(`当前全局图片数量: ${globalTempImages.length}`);
    
    try {
      // 等待页面完全加载后再处理
      const processRequest = () => {
        extractContent()
          .then(content => {
            if (!content) {
              throw new Error('内容提取失败：返回值为空');
            }
            
            // 确保图片数组存在且有效
            if (!content.images || !Array.isArray(content.images)) {
              content.images = [];
              addLog('警告: 图片数组无效，已重置为空数组');
            }
            
            addLog(`内容提取完成，筛选后图片数量: ${content.images.length || 0}`);
            
            // 添加标志表明这些图片已经过筛选
            content.imagesFiltered = true;
            content.logs = detailedLogs;
            
            // 添加文本内容可用标志
            content.hasTextContent = content.content && content.content.length > 0;
            
            console.log('[内容脚本] 准备发送响应');
      sendResponse(content);
            console.log('[内容脚本] 响应发送成功');
          })
          .catch(error => {
            addLog(`处理消息时出错: ${error.message}`);
            // 即使出错，也返回页面标题和文本内容
            sendResponse({ 
              error: error.message,
              logs: detailedLogs,
              title: document.title || '',
              content: document.body.innerText.substring(0, 10000) || '内容提取失败',
              contentMarkdown: '',
              images: [],
              imagesFiltered: true, // 标记图片已筛选（虽然为空）
              hasTextContent: true, // 标记有文本内容
              url: window.location.href
            });
          });
      };

      // 如果页面还在加载，等待加载完成
      if (document.readyState !== 'complete') {
        addLog(`页面加载状态: ${document.readyState}，等待完成...`);
        window.addEventListener('load', () => {
          addLog('页面加载完成，开始处理');
          processRequest();
        });
      } else {
        addLog('页面已加载完成，直接处理');
        processRequest();
      }
    } catch (error) {
      addLog(`处理请求时发生错误: ${error.message}`);
      // 即使出错，也尝试返回基本文本内容
      sendResponse({ 
        error: error.message,
        logs: detailedLogs,
        title: document.title || '',
        content: document.body.innerText.substring(0, 10000) || '内容提取失败',
        images: [],
        imagesFiltered: true,
        hasTextContent: true,
        url: window.location.href
      });
    }
    
    return true; // 表示会异步发送响应
  } else if (request.action === 'showAIResult') {
    console.log('=== AI 返回的内容 ===');
    console.log(request.data);
    console.log('==================');
  }
  return true;
});

// 删除整个 extractContentWithLogs 函数及其后面的代码
// 获取所有图片元素
function getAllImages() {
  const images = [];
  console.log("[内容脚本] 开始收集所有图片元素");
  
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
  
  console.log("[内容脚本] 收集到图片元素数量:", images.length);
  return images;
}

const allImgElements = getAllImages();

// 处理小红书图片 URL
function processXiaohongshuImageUrl(url) {
  console.log("[内容脚本] 处理小红书图片 URL:", url);
  return url; // 这里可以添加特定处理逻辑
}

// 获取小红书图片
function getXiaohongshuImages() {
  console.log("[内容脚本] 获取小红书特定图片");
  const images = Array.from(document.querySelectorAll(`
    img.note-content-emoji, 
    img.note-slider-img, 
    img[data-xhs-img]
  `));
  console.log("[内容脚本] 找到小红书特定图片数量:", images.length);
  return images.map(img => img.src);
}
