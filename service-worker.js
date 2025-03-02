let config = {};
const MAX_LOG_ENTRIES = 100;
let logs = [];

// 初始化配置
chrome.storage.sync.get([
  'aiProvider', 'aiApiKey', 'aiApiEndpoint', 'aiModel',
  'notionToken', 'notionDbId',
  'cloudflareAccountId', 'cloudflareApiToken', 'cloudflareImageId'
], (result) => {
  config = result;
  console.log('加载配置:', {
    aiProvider: config.aiProvider || '未设置',
    aiApiKey: config.aiApiKey ? '已设置' : '未设置',
    notionToken: config.notionToken ? '已设置' : '未设置',
    notionDbId: config.notionDbId || '未设置',
    cloudflareAccountId: config.cloudflareAccountId ? '已设置' : '未设置',
    cloudflareApiToken: config.cloudflareApiToken ? '已设置' : '未设置',
    cloudflareImageId: config.cloudflareImageId || '未设置'
  });
});

// 监听配置变化
chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) {
    config[key] = newValue;
  }
});

// 导入Cloudflare服务
import cloudflareService from './cloudflare.js';

// 处理图片上传
async function uploadImageToCloudflare(imageUrl) {
  try {
    const cloudflareUrl = await cloudflareService.uploadImage(imageUrl);
    addLog(`图片上传成功: ${cloudflareUrl}`, 'info');
    return cloudflareUrl;
  } catch (error) {
    addLog(`图片上传失败: ${error.message}`, 'error');
    throw error;
  }
}

// 处理所有图片上传
async function processImages(images) {
  const processedImages = [];
  for (const imageUrl of images) {
    try {
      const cloudflareUrl = await uploadImageToCloudflare(imageUrl);
      processedImages.push(cloudflareUrl);
      addLog(`处理图片成功: ${imageUrl} -> ${cloudflareUrl}`);
    } catch (error) {
      addLog(`处理图片失败: ${imageUrl} - ${error.message}`, 'warning');
      processedImages.push(imageUrl); // 如果上传失败，使用原始URL
    }
  }
  return processedImages;
}

// 日志系统
function addLog(message, level = 'info') {
  logs.push({
    timestamp: Date.now(),
    level,
    message: typeof message === 'string' ? message : JSON.stringify(message)
  });
  if (logs.length > MAX_LOG_ENTRIES) logs.shift();
  chrome.runtime.sendMessage({
    action: 'newLog',
    text: message,
    timestamp: Date.now(),
    level
  }).catch(() => {});
}

// 消息处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'processAndSave') {
    handleSaveRequest(request.tabId, sendResponse);
    return true;
  }
  if (request.action === 'getLogs') {
    sendResponse(logs);
  }
  if (request.action === 'fetchImage') {
    console.log('后台脚本收到获取图片请求:', request.url);
    
    fetch(request.url, { 
      method: 'GET', 
      mode: 'cors',
      headers: request.headers || {}
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`获取图片失败: ${response.status} ${response.statusText}`);
        }
        return response.blob();
      })
      .then(blob => {
        console.log('图片获取成功，类型:', blob.type, '大小:', blob.size);
        sendResponse({ success: true, blob: blob });
      })
      .catch(error => {
        console.error('获取图片失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // 表示异步响应
  }
});

async function handleSaveRequest(tabId, sendResponse) {
  try {
    addLog('开始处理保存请求');
    
    // 检查配置
    if (!config.aiApiKey || !config.aiApiEndpoint || !config.aiModel || 
        !config.notionToken || !config.notionDbId || 
        !config.cloudflareAccountId || !config.cloudflareApiToken || !config.cloudflareImageId) {
      throw new Error('请先完成 AI、Notion 和 Cloudflare 配置');
    }

    // 获取数据库结构
    addLog('获取数据库结构...');
    const schema = await getDatabaseSchema(config.notionDbId);
    addLog('数据库结构:', schema);

    // 获取页面内容
    const pageData = await getPageContent(tabId);
    addLog('页面内容获取结果', pageData);
    
    if (!pageData?.content) {
      throw new Error('无法提取页面内容');
    }

    // 内容处理
    addLog('开始内容摘要处理');
    const processedContent = await processContent(pageData.content);
    
    // 从本地存储获取关键词（如果有）
    let storedKeywords = '';
    try {
      const result = await chrome.storage.local.get(['keywords']);
      storedKeywords = result.keywords || '';
      addLog('从本地存储获取的关键词:', storedKeywords);
    } catch (error) {
      addLog(`获取存储的关键词失败: ${error.message}`, 'error');
    }
    
    // 使用存储的关键词（如果有）或回退到处理内容中的关键词
    const keywords = storedKeywords || processedContent.keywords;
    addLog('最终使用的关键词:', keywords);
    
    // 处理图片上传
    let cloudflareImageUrl = '';
    let processedImages = [];
    if (pageData.images && pageData.images.length > 0) {
      addLog(`开始处理${pageData.images.length}张图片...`);
      processedImages = await processImages(pageData.images);
      // 使用第一张图片作为封面
      cloudflareImageUrl = processedImages[0] || '';
      addLog('图片处理完成');

      // 替换内容中的图片URL
      let markdownContent = pageData.contentMarkdown;
      pageData.images.forEach((originalUrl, index) => {
        markdownContent = markdownContent.replace(
          new RegExp(originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          processedImages[index]
        );
      });
      pageData.contentMarkdown = markdownContent;
      addLog('已更新内容中的图片URL');
    }

    // 构建Notion数据
    const notionData = {
      parent: { database_id: config.notionDbId },
      properties: {}
    };

    // 根据数据库结构构建属性
    for (const [key, prop] of Object.entries(schema)) {
      switch (prop.type) {
        case 'title':
          notionData.properties[key] = {
            title: [{ text: { content: (pageData.title || '无标题').slice(0, 30) } }]
          };
          break;
        case 'url':
          notionData.properties[key] = { url: pageData.url };
          break;
        case 'rich_text':
          // 根据字段名称判断内容类型
          if (key.includes('摘要') || key.includes('总结')) {
            notionData.properties[key] = {
              rich_text: [{ text: { content: processedContent.summary } }]
            };
          } else if (key.includes('亮点') || key.includes('要点')) {
            notionData.properties[key] = {
              rich_text: [{ text: { content: processedContent.outline } }]
            };
          } else if (key.includes('关键词')) {
            notionData.properties[key] = {
              rich_text: [{ text: { content: keywords } }]
            };
          }
          break;
        case 'date':
          notionData.properties[key] = {
            date: { start: new Date().toISOString() }
          };
          break;
        case 'files':
          if (cloudflareImageUrl) {
            notionData.properties[key] = {
              files: [{ name: 'cover', external: { url: cloudflareImageUrl } }]
            };
          }
          break;
      }
    }

    // 添加调试日志
    addLog('数据库字段映射:', {
      title: Object.keys(schema).find(key => schema[key].type === 'title'),
      summary: Object.keys(schema).find(key => schema[key].type === 'rich_text' && (key.includes('摘要') || key.includes('总结'))),
      highlights: Object.keys(schema).find(key => schema[key].type === 'rich_text' && (key.includes('亮点') || key.includes('要点'))),
      keywords: Object.keys(schema).find(key => schema[key].type === 'rich_text' && key.includes('关键词'))
    });

    // 保存到Notion
    addLog('正在保存到Notion...');
    addLog('保存数据:', notionData);
    await saveToNotion(notionData, pageData, processedImages);
    
    // 清理本地存储的关键词
    try {
      await chrome.storage.local.remove(['keywords']);
      addLog('已清理本地存储的关键词');
    } catch (error) {
      addLog(`清理关键词失败: ${error.message}`, 'warning');
    }
    
    sendResponse({ success: true });
    addLog('保存成功');
    chrome.runtime.sendMessage({ action: 'taskCompleted' }).catch(() => {});
  } catch (error) {
    addLog(`保存失败: ${error.message}`, 'error');
    sendResponse({ success: false, error: error.message });
  }
}

async function getPageContent(tabId) {
  try {
    addLog('开始获取页面内容');
    const [results] = await chrome.scripting.executeScript({
      target: { tabId },
      function: () => {
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
        let contentElement = null;
        let contentText = '';
        let contentHtml = '';
        let images = [];

        // 检查是否为小红书网站
        if (window.location.hostname.includes('xiaohongshu.com')) {
          const noteContent = document.querySelector('.note-content');
          if (noteContent) {
            contentElement = noteContent;
            contentText = noteContent.innerText.trim();
            contentHtml = noteContent.innerHTML;
            const imgElements = noteContent.querySelectorAll('img');
            imgElements.forEach(img => {
              images.push(img.src);
            });
          }
        } else {
          // 首先尝试使用选择器
          for (const selector of contentSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              contentElement = element;
              contentText = element.innerText.trim();
              contentHtml = element.innerHTML;
              const imgElements = element.querySelectorAll('img');
              imgElements.forEach(img => {
                images.push(img.src);
              });
              break;
            }
          }
        }

        // 如果没有找到内容，使用 body
        if (!contentElement) {
          contentElement = document.body;
          contentText = document.body.innerText.trim();
          contentHtml = document.body.innerHTML;
        }

        // 清理和格式化内容
        contentText = contentText.replace(/[\n]{3,}/g, '\n\n').trim();
        
        // 将HTML转换为Markdown
        function htmlToMarkdown(element) {
          if (!element) return '';
          
          // 创建一个文档片段来处理内容
          const clone = element.cloneNode(true);
          
          // 处理标题
          const headings = clone.querySelectorAll('h1, h2, h3, h4, h5, h6');
          headings.forEach(heading => {
            const level = parseInt(heading.tagName[1]);
            const hashes = '#'.repeat(level);
            heading.outerHTML = `\n${hashes} ${heading.textContent.trim()}\n`;
          });
          
          // 处理段落
          const paragraphs = clone.querySelectorAll('p');
          paragraphs.forEach(p => {
            p.outerHTML = `\n${p.textContent.trim()}\n`;
          });
          
          // 处理列表
          const listItems = clone.querySelectorAll('li');
          listItems.forEach(item => {
            const parent = item.parentElement;
            const prefix = parent.tagName === 'OL' ? '1. ' : '- ';
            item.outerHTML = `${prefix}${item.textContent.trim()}\n`;
          });
          
          // 处理链接
          const links = clone.querySelectorAll('a');
          links.forEach(link => {
            const text = link.textContent.trim();
            const href = link.getAttribute('href');
            if (href) {
              link.outerHTML = `[${text}](${href})`;
            }
          });
          
          // 处理图片
          const images = clone.querySelectorAll('img');
          images.forEach(img => {
            const alt = img.getAttribute('alt') || '';
            const src = img.getAttribute('src');
            if (src) {
              img.outerHTML = `![${alt}](${src})`;
            }
          });
          
          // 处理粗体文本
          const boldTexts = clone.querySelectorAll('strong, b');
          boldTexts.forEach(bold => {
            bold.outerHTML = `**${bold.textContent.trim()}**`;
          });
          
          // 处理斜体文本
          const italicTexts = clone.querySelectorAll('em, i');
          italicTexts.forEach(italic => {
            italic.outerHTML = `*${italic.textContent.trim()}*`;
          });
          
          // 处理代码块
          const codeBlocks = clone.querySelectorAll('pre');
          codeBlocks.forEach(block => {
            const code = block.textContent.trim();
            block.outerHTML = `\n\`\`\`\n${code}\n\`\`\`\n`;
          });
          
          // 处理行内代码
          const inlineCodes = clone.querySelectorAll('code');
          inlineCodes.forEach(code => {
            if (!code.closest('pre')) { // 避免重复处理pre>code
              code.outerHTML = `\`${code.textContent.trim()}\``;
            }
          });
          
          // 处理引用
          const blockquotes = clone.querySelectorAll('blockquote');
          blockquotes.forEach(quote => {
            const lines = quote.textContent.trim().split('\n');
            const quotedLines = lines.map(line => `> ${line}`).join('\n');
            quote.outerHTML = `\n${quotedLines}\n`;
          });
          
          // 处理水平线
          const hrs = clone.querySelectorAll('hr');
          hrs.forEach(hr => {
            hr.outerHTML = '\n---\n';
          });
          
          // 获取处理后的文本内容
          let markdown = clone.textContent || clone.innerText || '';
          
          // 清理多余的空行
          markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
          
          return markdown;
        }
        
        // 将HTML字符串转换为Markdown
        function convertHtmlStringToMarkdown(html) {
          if (!html) return '';
          
          // 创建一个临时的div元素
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = html;
          
          return htmlToMarkdown(tempDiv);
        }
        
        // 生成Markdown内容
        const contentMarkdown = htmlToMarkdown(contentElement);

        return {
          title: title.trim(),
          content: contentText.substring(0, 10000), // 保留原始文本内容
          contentMarkdown: contentMarkdown.substring(0, 10000), // 添加Markdown格式内容
          image: mainImage,
          url: url.split('?')[0], // 去除URL参数
          images: images // 返回所有图片
        };
      }
    });

    if (!results?.result) {
      addLog('执行脚本失败', 'error');
      throw new Error('执行内容脚本失败');
    }

    const { result } = results;
    if (!result.content) {
      addLog('未能获取到页面内容', 'error');
      throw new Error('无法提取页面内容');
    }

    addLog('成功获取页面内容');
    return result;
  } catch (error) {
    addLog(`内容提取失败: ${error.message}`, 'error');
    throw error;
  }
}

async function processContent(content) {
  try {
    addLog(`使用 ${config.aiProvider} API`);
    
    // 清理内容中的代码块
    const cleanContent = content.replace(/```[\s\S]*?```/g, '')
                               .replace(/`[^`]*`/g, '');

      const requestBody = {
        model: config.aiModel,
        messages: [{
          role: "user",
          content: `请通过三方面分析并总结这篇文章：

1. 全文总结：
请用一段话概括文章的主要内容。

2. 重要亮点：
- 请提取1-3个重要观点或亮点
- 每个亮点是一句话
- 按重要性排序

3. 关键词：
- 请提取1-3个关键词
- 每个关键词是一个单词或短语
- 按重要性排序

最后按照以下格式输出：
### 全文总结
<全文总结>
### 重要亮点
1. <亮点1>
2. <亮点2>
...
### 关键词
<关键词1>
<关键词2>
...

原文：
${cleanContent.substring(0, 3000)}`
        }],
        stream: false,
        max_tokens: 2000,
        temperature: 0.7,
        top_p: 0.9
      };

    addLog('发送到 API 的请求:', requestBody);

    const response = await fetch(config.aiApiEndpoint + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.aiApiKey
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    addLog('API 原始响应:', responseText);

    if (!response.ok) {
      try {
        const err = JSON.parse(responseText);
        addLog(`API响应状态: ${response.status}`);
        addLog(`API错误详情:`, err);
        throw new Error(`API错误: ${err?.message || response.status}`);
      } catch (parseError) {
        throw new Error(`API错误: ${response.status} - ${responseText}`);
      }
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      addLog('API 响应解析失败:', parseError);
      throw new Error('API 响应格式错误');
    }

    const resultText = data.choices?.[0]?.message?.content;
    if (!resultText) {
      addLog('API 响应缺少内容');
      throw new Error('API 响应缺少内容');
    }

    addLog('API 返回的内容:', resultText);

    try {
      // 提取总结部分
      const summaryMatch = resultText.match(/###\s*全文总结\s*([\s\S]*?)(?=\n###\s*(重要亮点|关键词)|$)/);
      let summary = summaryMatch ? summaryMatch[1].trim() : '无法提取总结';

      // 提取亮点部分
      const outlineMatch = resultText.match(/###\s*重要亮点\s*([\s\S]*?)(?=\n###\s*(关键词|$))/);
      let outline = outlineMatch ? outlineMatch[1].trim() : '';

      // 提取关键词部分
      const keywordsMatch = resultText.match(/###\s*关键词\s*([\s\S]*?)(?=\n###\s*|$)/);
      let keywords = keywordsMatch ? keywordsMatch[1].trim() : '';

      // 清理总结中可能包含的亮点部分和标题
      summary = summary
        .split(/(?:\n|^)(?:###\s*)?重要亮点[：:]/)[0] // 移除"重要亮点"及其内容
        .split(/\n\d+\./)[0] // 移除编号列表
        .replace(/^###\s*/, '') // 移除开头的 ###
        .replace(/[：:]\s*$/, '') // 移除末尾的冒号
        .trim();

      // 格式化亮点
      if (outline) {
        // 提取亮点列表
        const points = outline.match(/(?:^|\n)[-•\d\.\s]*([^-•\n]+)/g) || [];
        outline = points
          .map((point, index) => {
            const cleanPoint = point
              .replace(/^[-•\d\.\s]+/, '') // 移除前缀符号
              .replace(/^###\s*/, '') // 移除 markdown 标记
              .trim();
            return `${index + 1}. ${cleanPoint}`;
          })
          .filter(point => point.length > 4) // 过滤掉太短的点
          .join('\n');
      }

      // 如果还是没有亮点，尝试从剩余文本中提取
      if (!outline) {
        const remainingText = resultText.replace(summaryMatch[0], '').trim();
        const points = remainingText.match(/(?:^|\n)[-•\d\.\s]*([^-•\n]+)/g) || [];
        outline = points
          .map((point, index) => {
            const cleanPoint = point
              .replace(/^[-•\d\.\s]+/, '') // 移除前缀符号
              .replace(/^###\s*/, '') // 移除 markdown 标记
              .trim();
            return `${index + 1}. ${cleanPoint}`;
          })
          .filter(point => 
            point.length > 4 && 
            !point.includes('全文总结') && 
            !point.includes('重要亮点')
          )
          .join('\n');
      }

      // 格式化关键词
      if (keywords) {
        // 提取关键词列表
        const points = keywords.match(/(?:^|\n)[-•\d\.\s]*([^-•\n]+)/g) || [];
        keywords = points
          .map((point, index) => {
            const cleanPoint = point
              .replace(/^[-•\d\.\s]+/, '') // 移除前缀符号
              .replace(/^###\s*/, '') // 移除 markdown 标记
              .trim();
            return cleanPoint;
          })
          .filter(point => point.length > 0) // 过滤掉空字符串
          .join(', ');
      }

      // 添加调试日志
      addLog('提取的关键词:', keywords);

      // 存储关键词到Chrome存储
      try {
        await chrome.storage.local.set({ keywords: keywords });
        addLog('关键词已成功存储到本地存储:', keywords);
      } catch (error) {
        addLog(`存储关键词失败: ${error.message}`, 'error');
        throw error;
      }

      return {
        summary,
        outline: outline || '无法提取重要亮点',
        keywords: keywords || '无法提取关键词'
      };
    } catch (parseError) {
      addLog('内容处理失败:', parseError);
      return {
        summary: resultText.substring(0, 1000),
        outline: '无法提取重要亮点，请检查原文格式',
        keywords: '无法提取关键词，请检查原文格式'
      };
    }
  } catch (error) {
    addLog(`内容处理失败: ${error.message}`, 'error');
    throw error;
  }
}

async function saveToNotion(data, pageData, processedImages) {
  try {
    // 创建 Notion 页面
    const pageResponse = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.notionToken}`,
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify(data)
    });

    if (!pageResponse.ok) {
      const error = await pageResponse.json();
      throw new Error(`Notion页面创建失败: ${error.message || pageResponse.status}`);
    }

    const createdPageData = await pageResponse.json();
    const pageId = createdPageData.id;

    // 添加内容到页面
    const blocks = [];

    // 先添加主图片（如果有）
    if (pageData.image) {
      try {
        // 验证图片URL是否有效
        const isValidImageUrl = (url) => {
          try {
            const parsedUrl = new URL(url);
            // 检查URL是否使用HTTPS协议
            if (parsedUrl.protocol !== 'https:') return false;
            // 检查URL是否指向图片文件
            const extension = parsedUrl.pathname.split('.').pop().toLowerCase();
            const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
            return validExtensions.includes(extension);
          } catch (e) {
            return false;
          }
        };

        if (isValidImageUrl(pageData.image)) {
          // 确保这里添加的是处理后的图片URL，而不是原始URL
          const imageUrl = processedImages && processedImages.length > 0 ? 
                          processedImages[0] : pageData.image;
          
          blocks.push({
            type: 'image',
            image: {
              type: 'external',
              external: { url: imageUrl }
            }
          });
          addLog(`添加主图片到Notion: ${imageUrl}`);
        }
      } catch (imageError) {
        // 如果添加图片失败，记录错误但继续处理其他内容
        addLog(`添加主图片失败: ${imageError.message}，已跳过`, 'warning');
      }
    }

    // 然后添加其他图片（如果有）
    if (pageData.images && Array.isArray(pageData.images) && processedImages && processedImages.length > 0) {
      // 使用处理后的图片URL数组，而不是原始URL
      for (let i = 0; i < processedImages.length; i++) {
        try {
          const imgUrl = processedImages[i];
          // 验证图片URL是否有效
          const isValidImageUrl = (url) => {
            try {
              const parsedUrl = new URL(url);
              // 检查URL是否使用HTTPS协议
              if (parsedUrl.protocol !== 'https:') return false;
              // 检查URL是否指向图片文件
              const extension = parsedUrl.pathname.split('.').pop().toLowerCase();
              const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
              return validExtensions.includes(extension);
            } catch (e) {
              return false;
            }
          };

          if (imgUrl && isValidImageUrl(imgUrl) && (i > 0 || imgUrl !== processedImages[0])) {
            blocks.push({
              type: 'image',
              image: {
                type: 'external',
                external: { url: imgUrl }
              }
            });
            addLog(`添加额外图片到Notion: ${imgUrl}`);
          }
        } catch (imageError) {
          // 如果添加图片失败，记录错误但继续处理其他内容
          addLog(`添加额外图片失败: ${imageError.message}，已跳过`, 'warning');
        }
      }
    }

    // 最后添加网页文本内容（使用Markdown格式）
    console.log('提取的Markdown内容:', pageData.contentMarkdown); // 添加调试日志
    if (pageData.contentMarkdown) {
      // 将长文本分割成多个小于2000字符的段落块
      const maxLength = 1900; // 设置略小于2000的限制，留出一些余量
      let content = pageData.contentMarkdown;
      
      // 按段落分割内容
      const paragraphs = content.split('\n\n');
      let currentBlock = '';
      
      // 处理每个段落，确保每个块不超过最大长度
      for (const paragraph of paragraphs) {
        // 如果当前段落本身就超过最大长度，需要进一步分割
        if (paragraph.length > maxLength) {
          // 先添加已累积的内容
          if (currentBlock) {
            blocks.push({
              type: 'paragraph',
              paragraph: {
                rich_text: [{ text: { content: currentBlock } }]
              }
            });
            currentBlock = '';
          }
          
          // 分割长段落
          let remainingText = paragraph;
          while (remainingText.length > 0) {
            const chunk = remainingText.substring(0, maxLength);
            blocks.push({
              type: 'paragraph',
              paragraph: {
                rich_text: [{ text: { content: chunk } }]
              }
            });
            remainingText = remainingText.substring(maxLength);
          }
        } 
        // 如果添加当前段落会超出限制，先创建一个块
        else if (currentBlock.length + paragraph.length + 2 > maxLength) { // +2 是为了考虑段落之间的换行
          blocks.push({
            type: 'paragraph',
            paragraph: {
              rich_text: [{ text: { content: currentBlock } }]
            }
          });
          currentBlock = paragraph;
        } 
        // 否则将段落添加到当前块
        else {
          if (currentBlock) {
            currentBlock += '\n\n' + paragraph;
          } else {
            currentBlock = paragraph;
          }
        }
      }
      
      // 添加最后剩余的内容
      if (currentBlock) {
        blocks.push({
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: currentBlock } }]
          }
        });
      }
    } else if (pageData.content) {
      // 如果没有Markdown内容，回退到普通文本内容，同样需要分割
      const maxLength = 1900;
      let content = pageData.content;
      
      // 分割长文本
      for (let i = 0; i < content.length; i += maxLength) {
        const chunk = content.substring(i, i + maxLength);
        blocks.push({
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: chunk } }]
          }
        });
      }
    } else {
      throw new Error('提取的内容为空，无法添加到 Notion 页面');
    }

    // 将块添加到页面
    try {
      const blockResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.notionToken}`,
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({
          children: blocks
        })
      });

      if (!blockResponse.ok) {
        const error = await blockResponse.json();
        addLog(`Notion内容添加部分失败: ${error.message || blockResponse.status}`, 'warning');
        // 不抛出错误，因为页面已经创建成功，只是内容添加有问题
      } else {
        addLog('内容成功保存到 Notion');
      }
    } catch (blockError) {
      addLog(`添加内容块时出错: ${blockError.message}，但页面已创建`, 'warning');
      // 不抛出错误，因为页面已经创建成功
    }

    return createdPageData;
  } catch (error) {
    addLog(`Notion API错误: ${error.message}`, 'error');
    throw error;
  }
}

async function getDatabaseSchema(databaseId) {
  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.notionToken}`,
        'Notion-Version': '2022-06-28'
      }
    });

    if (!response.ok) {
      throw new Error('获取数据库结构失败');
    }

    const data = await response.json();
    return data.properties;
  } catch (error) {
    addLog(`获取数据库结构失败: ${error.message}`, 'error');
    throw error;
  }
}
