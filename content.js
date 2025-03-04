// 1. 全局变量和工具函数定义
let globalTempImages = [];
let globalObservedImages = new Set();
let detailedLogs = [];

// 日志功能
function addLog(message, level = 'info') {
  const log = `[内容脚本] ${message}`;
  detailedLogs.push(log);
  console.log(log);
}

console.log('[内容脚本v1.5] 开始初始化');

// 2. 内容提取相关函数
async function extractContent() {
  try {
    addLog('开始提取页面内容');
    
    // 1. 获取页面基本信息
    const title = document.title.trim();
    const url = window.location.href.split('?')[0];
    addLog(`标题: ${title}`);
    
    // 2. 获取主要内容
    const content = document.body.innerText;
    if (!content) {
      addLog('无法提取到有效内容', 'error');
      return {
        success: false,
        error: '无法提取到有效内容',
        logs: detailedLogs
      };
    }
    
    // 3. 获取并筛选图片
    const images = await getFilteredImages();
    addLog(`找到 ${images.length} 张图片`);
    
    // 4. 构建返回数据
    const response = {
      success: true,
      title,
      url,
      content: content.substring(0, 10000), // 限制内容长度
      images,
      logs: detailedLogs
    };

    addLog('内容提取完成');
    return response;

  } catch (error) {
    addLog(`内容提取失败: ${error.message}`, 'error');
    return {
      success: false,
      error: error.message,
      logs: detailedLogs
    };
  }
}

// 3. 图片处理相关函数
async function getFilteredImages() {
  addLog('开始筛选图片');
  
  // 获取所有图片
  const allImages = getAllImages();
  addLog(`找到 ${allImages.length} 张原始图片`);
  
  // 筛选有效图片
  const validImages = allImages.filter(img => {
    // 获取图片尺寸
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    
    // 检查图片 URL
    const url = getImageUrl(img);
    if (!url) {
      addLog(`跳过无效 URL 的图片: ${img.src}`);
      return false;
    }

    // 跳过小图片
    if (width < 800 || height < 600) {
      addLog(`跳过小图片: ${url} (${width}x${height})`);
      return false;
    }

    // 跳过 base64 图片
    if (url.startsWith('data:')) {
      addLog(`跳过 base64 图片`);
      return false;
    }

    // 检查图片比例
    const ratio = width / height;
    if (ratio > 5 || ratio < 0.2) {
      addLog(`跳过比例异常的图片: ${url} (${width}x${height})`);
      return false;
    }

    addLog(`保留有效图片: ${url} (${width}x${height})`);
    return true;
  });

  addLog(`筛选后保留 ${validImages.length} 张有效图片`);

  // 获取所有有效图片的 URL
  const imageUrls = validImages.map(img => getImageUrl(img))
    .filter(url => url && !url.startsWith('data:'));

  // 去重
  const uniqueUrls = [...new Set(imageUrls)];
  addLog(`去重后剩余 ${uniqueUrls.length} 张图片`);

  return uniqueUrls;
}

function getAllImages() {
  addLog('开始收集页面所有图片元素');
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
  
  addLog(`收集到 ${images.length} 个图片元素`);
  return images;
}

function getImageUrl(imgElement) {
  try {
    const url = imgElement.src || 
              imgElement.dataset.src || 
              imgElement.getAttribute('data-src') ||
              imgElement.getAttribute('data-lazy-src') ||
              imgElement.getAttribute('data-original') ||
              imgElement.currentSrc;
    
    if (url && !url.startsWith('data:')) {
      addLog(`提取到图片 URL: ${url}`);
      return url;
    }
    
    const style = window.getComputedStyle(imgElement);
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      const extractedUrl = bgImage.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
      addLog(`从背景提取到图片 URL: ${extractedUrl}`);
      return extractedUrl;
    }
    
    return null;
  } catch (error) {
    addLog(`获取图片 URL 失败: ${error.message}`, 'error');
    return null;
  }
}

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
    
// 4. DOM 观察相关
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

// 5. 消息处理
const messageListener = (request, sender, sendResponse) => {
  console.log('[内容脚本] 收到消息:', request.action);
  
  if (request.action === 'getPageContent') {
    console.log('[内容脚本] 开始提取内容');
    
    // 直接返回提取的内容，不使用异步消息
    extractContent()
      .then(response => {
        console.log('[内容脚本] 内容提取完成，直接发送响应');
        sendResponse(response);
      })
      .catch(error => {
        console.error('[内容脚本] 内容提取失败:', error);
        sendResponse({
          success: false,
          error: error.message,
          logs: detailedLogs
        });
      });
    
    return true; // 表示我们会异步发送响应
  }
};

// 6. 初始化
// 移除旧的监听器（如果存在）并添加新的
chrome.runtime.onMessage.removeListener(messageListener);
chrome.runtime.onMessage.addListener(messageListener);

// DOM ready check
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runWhenDOMReady);
} else {
  runWhenDOMReady();
}

// 发送就绪消息
console.log('[内容脚本] 初始化完成');
chrome.runtime.sendMessage({ 
  action: 'contentScriptReady',
  url: window.location.href 
});

// 添加心跳响应
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ status: 'alive' });
  return true;
  }
});

