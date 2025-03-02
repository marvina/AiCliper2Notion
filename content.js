// 提取页面核心内容
console.log('[内容脚本v1.4] 已加载');

// 修改为异步函数
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
    
    // 检查是否是小红书页面
    if (window.location.hostname.includes('xiaohongshu.com')) {
      // 小红书图片提取逻辑...
      console.log('[内容脚本] 检测到小红书页面，开始提取图片');
      
      // 查找所有可能包含图片的容器
      const imgContainers = document.querySelectorAll('.img-container, .swiper-slide, .note-content');
      
      if (imgContainers.length > 0) {
        console.log(`[内容脚本] 找到 ${imgContainers.length} 个可能的图片容器`);
        
        // 遍历每个容器
        imgContainers.forEach(container => {
          // 查找容器内的所有图片
          const images = container.querySelectorAll('img');
          
          // 处理每张图片
          images.forEach(img => {
            // 检查图片是否已加载且符合尺寸要求
            if (img.complete && img.naturalWidth >= 800 && img.naturalHeight >= 600) {
              console.log(`[内容脚本] 已加载图片符合尺寸: ${img.src} (${img.naturalWidth}x${img.naturalHeight})`);
              tempImages.push(img.src);
            } 
            // 对于未完全加载或尺寸不符合要求的图片，检查data-src属性
            else if (img.dataset.src) {
              tempImages.push(img.dataset.src);
            }
            // 对于未加载完成的图片，也添加到待检查列表
            else if (img.src && !img.src.includes('data:image') && (!img.complete || img.naturalWidth === 0)) {
              tempImages.push(img.src);
            }
          });
        });
      } else {
        console.log('[内容脚本] 未找到图片容器，尝试获取所有图片');
        
        // 获取页面上所有图片
        const allImgElements = document.querySelectorAll('img');
        allImgElements.forEach(img => {
          if (img.src && !img.src.includes('data:image')) {
            tempImages.push(img.src);
          } else if (img.dataset.src) {
            tempImages.push(img.dataset.src);
          }
        });
      }
    } else {
      // 非小红书页面的图片提取逻辑
      console.log('[内容脚本] 非小红书页面，提取所有图片');
      
      // 尝试从meta标签获取主图片
      mainImage = document.querySelector('meta[property="og:image"]')?.content ||
                 document.querySelector('meta[name="twitter:image"]')?.content || '';
      
      if (mainImage) {
        console.log(`[内容脚本] 从meta标签找到主图片: ${mainImage}`);
        tempImages.push(mainImage);
      }
      
      // 获取所有图片元素
      const allImgElements = document.querySelectorAll('img');
      console.log(`[内容脚本] 页面上找到 ${allImgElements.length} 张图片`);
      
      allImgElements.forEach(img => {
        // 检查图片是否已加载且符合尺寸要求
        if (img.complete && img.naturalWidth >= 800 && img.naturalHeight >= 600) {
          console.log(`[内容脚本] 已加载图片符合尺寸: ${img.src} (${img.naturalWidth}x${img.naturalHeight})`);
          tempImages.push(img.src);
        } 
        // 对于未完全加载的图片，添加到待检查列表
        else if (img.src && !img.src.includes('data:image') && (!img.complete || img.naturalWidth === 0)) {
          tempImages.push(img.src);
        } 
        // 检查data-src属性（懒加载）
        else if (img.dataset.src) {
          tempImages.push(img.dataset.src);
        }
      });
    }
    
    // 去重
    tempImages = [...new Set(tempImages)];
    console.log(`[内容脚本] 收集到 ${tempImages.length} 张待验证图片`);
    
    // 检查所有图片尺寸
    for (const imgUrl of tempImages) {
      try {
        const isValidSize = await checkImageSize(imgUrl);
        if (isValidSize) {
          allImages.push(imgUrl);
        } else {
          console.log(`[内容脚本] 图片未通过尺寸检查，不添加: ${imgUrl}`);
        }
      } catch (error) {
        console.error(`[内容脚本] 尺寸检查失败: ${imgUrl}`, error);
        // 出错时不添加图片
      }
    }
    
    // 去重
    allImages = [...new Set(allImages)];
    console.log('[内容脚本] 最终符合尺寸要求的图片数量:', allImages.length);
    
    // 设置主图片
    if (allImages.length > 0) {
      mainImage = allImages[0];
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
      images: allImages, // 返回所有符合尺寸要求的图片
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
