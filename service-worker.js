// 1. 导入和配置
import cloudflareService from './cloudflare.js';

// 配置初始化
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

// 2. 工具函数
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

// 3. 图片处理函数
async function fetchImage(url, headers) {
  // ... 图片获取函数实现 ...
}

async function uploadImageToCloudflare(imageUrl) {
  try {
    addLog(`开始上传图片: ${imageUrl}`);
    const cloudflareUrl = await cloudflareService.uploadImage(imageUrl);
    addLog(`图片上传成功: ${cloudflareUrl}`);
    return cloudflareUrl;
  } catch (error) {
    addLog(`图片上传失败: ${error.message}`, 'error');
    throw error;
  }
}

async function processImages(images) {
  try {
    if (!Array.isArray(images) || images.length === 0) {
      addLog('没有图片需要处理');
      return [];
    }

    addLog(`开始处理 ${images.length} 张图片`);
    
    // 逐个上传图片
    const uploadPromises = images.map(async (imageUrl) => {
      try {
        return await uploadImageToCloudflare(imageUrl);
      } catch (error) {
        addLog(`单张图片上传失败: ${error.message}`, 'warning');
        return null;
      }
    });

    const results = await Promise.all(uploadPromises);
    const successfulUploads = results.filter(Boolean);
    
    addLog(`图片处理完成，成功上传 ${successfulUploads.length}/${images.length} 张`);
    return successfulUploads;
  } catch (error) {
    addLog(`图片处理过程出错: ${error.message}`, 'error');
    throw error;
  }
}

// 4. Notion 相关函数
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

function buildNotionPageProperties(title, content, images) {
  // ... 构建 Notion 页面属性函数实现 ...
}

async function saveToNotion(data, pageData, processedImages) {
  // ... 保存到 Notion 函数实现 ...
}

// 5. 内容处理函数
async function processContent(content) {
  try {
    console.log('[AI处理] 开始内容摘要处理');
    addLog(`使用 ${config.aiProvider} API`);
    
    // 清理内容中的代码块
    const cleanContent = content.replace(/```[\s\S]*?```/g, '')
                               .replace(/`[^`]*`/g, '');

    // 构建 API 请求数据
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

    console.log('[AI处理] 发送请求到 API:', requestBody);

    // 发送请求到 OpenAI API
    const response = await fetch(config.aiApiEndpoint + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.aiApiKey
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log('[AI处理] API 原始响应:', responseText);

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`);
    }

    const data = JSON.parse(responseText);
    const resultText = data.choices?.[0]?.message?.content;
    
    if (!resultText) {
      throw new Error('API 响应缺少内容');
    }

    // 发送消息到当前活动标签页，显示 AI 返回的内容
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'showAIResult',
        data: resultText
      });
    }

    console.log('[AI处理] API 返回的内容:', resultText);

    // 提取内容
    const summaryMatch = resultText.match(/###\s*全文总结\s*([\s\S]*?)(?=\n###\s*(重要亮点|关键词)|$)/);
      const outlineMatch = resultText.match(/###\s*重要亮点\s*([\s\S]*?)(?=\n###\s*(关键词|$))/);
      const keywordsMatch = resultText.match(/###\s*关键词\s*([\s\S]*?)(?=\n###\s*|$)/);

    // 处理提取的内容
    const summary = summaryMatch ? summaryMatch[1].trim() : '';
    const outline = outlineMatch ? outlineMatch[1].trim()
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('###'))
      .join('\n') : '';
    const keywords = keywordsMatch ? keywordsMatch[1].trim()
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('###'))
      .join(', ') : '';

    console.log('[AI处理] 提取的内容:', {
      summary,
      outline,
      keywords
    });

    // 存储关键词到本地存储
      if (keywords) {
      await chrome.storage.local.set({ keywords });
      console.log('[AI处理] 关键词已保存到本地存储:', keywords);
    }

    const processedResult = {
      summary: summary || '无法提取总结',
      outline: outline || '无法提取亮点',
      keywords: keywords || '无法提取关键词',
      created_at: new Date().toISOString()
    };

    console.log('[AI处理] 最终处理结果:', processedResult);
    return processedResult;

  } catch (error) {
    console.error('[AI处理] 处理失败:', error);
    addLog(`AI 处理失败: ${error.message}`, 'error');
    throw error;
  }
}

async function getPageContent(tabId) {
  try {
    if (!tabId) {
      throw new Error('缺少标签页 ID');
    }

    addLog(`开始获取页面内容，标签页 ID: ${tabId}`);
    
    // 检查内容脚本是否已加载
    let contentScriptLoaded = false;
    try {
      // 尝试发送一个简单的 ping 消息来检查内容脚本是否已加载
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      contentScriptLoaded = true;
      addLog('内容脚本已加载');
    } catch (error) {
      addLog('内容脚本未加载，尝试注入...', 'warning');
      contentScriptLoaded = false;
    }
    
    // 如果内容脚本未加载，手动注入
    if (!contentScriptLoaded) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        addLog('内容脚本注入成功');
        
        // 等待内容脚本初始化
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (injectError) {
        addLog(`内容脚本注入失败: ${injectError.message}`, 'error');
        throw new Error('无法注入内容脚本');
      }
    }
    
    // 发送获取内容的消息
    addLog('向内容脚本发送获取内容请求');
    let response;
    try {
      response = await chrome.tabs.sendMessage(tabId, {
        action: 'getPageContent',
        includeDetailedLogs: true
      });
    } catch (messageError) {
      addLog(`消息发送失败: ${messageError.message}，尝试备用方法`, 'warning');
      return await getPageContentFallback(tabId);
    }
    
    if (!response) {
      addLog('未收到内容脚本响应', 'error');
      throw new Error('内容脚本未响应');
    }
    
    if (response.error) {
      addLog(`内容脚本报告错误: ${response.error}`, 'error');
      throw new Error(response.error);
    }
    
    if (!response.content) {
      addLog('未能获取到页面内容', 'error');
      throw new Error('无法提取页面内容');
    }
    
    // 显示图片筛选日志
    if (response.logs && response.logs.length > 0) {
      addLog('图片筛选过程日志:');
      response.logs.forEach((logEntry, index) => {
        // 只显示前20条和最后5条，避免日志过长
        if (index < 20 || index > response.logs.length - 6) {
          addLog(`  ${logEntry}`);
        } else if (index === 20) {
          addLog(`  ... (省略 ${response.logs.length - 25} 条) ...`);
        }
      });
    } else {
      addLog('警告: 未收到图片筛选日志', 'warning');
    }
    
    addLog('成功获取页面内容');
    addLog(`获取到的图片数量: ${response.images?.length || 0}`);
    
    if (response.images && response.images.length > 0) {
      addLog(`图片列表: ${JSON.stringify(response.images.slice(0, 3))}...`);
    }
    
    return response;
  } catch (error) {
    addLog(`内容提取失败: ${error.message}，尝试备用方法`, 'error');
    if (!tabId) {
      throw new Error('缺少标签页 ID');
    }
    try {
      return await getPageContentFallback(tabId);
    } catch (fallbackError) {
      addLog(`备用方法也失败了: ${fallbackError.message}`, 'error');
      throw error; // 抛出原始错误
    }
  }
}

async function getPageContentFallback(tabId) {
  addLog('使用备用方法提取内容');
  
  const [results] = await chrome.scripting.executeScript({
    target: { tabId },
    function: () => {
      // 内联的内容提取逻辑
      const title = document.title;
      const url = window.location.href;
      
      // 查找主图片
      const mainImage = document.querySelector('meta[property="og:image"]')?.content ||
                       document.querySelector('meta[name="twitter:image"]')?.content ||
                       document.querySelector('article img')?.src || '';
      
      // 收集所有图片
      const images = Array.from(document.querySelectorAll('img'))
        .map(img => img.src)
        .filter(src => src && src.startsWith('http'));
      
      // 获取内容
      const contentElement = document.querySelector('article') || 
                            document.querySelector('.content') || 
                            document.body;
      
      const content = contentElement.innerText
        .replace(/[\n]{3,}/g, '\n\n')
        .trim();

        return {
          title: title.trim(),
        content: content.substring(0, 10000),
          image: mainImage,
        images: images,
        url: url.split('?')[0],
        logs: ['使用备用方法提取内容']
        };
      }
    });

    if (!results?.result) {
    addLog('备用方法也失败了', 'error');
      throw new Error('无法提取页面内容');
    }

  return results.result;
}

// 6. 主要处理函数
async function handleSaveRequest(tabId, sendResponse) {
  try {
    addLog('开始处理保存请求');
    addLog(`处理标签页 ID: ${tabId}`); // 添加日志

    if (!tabId) {
      throw new Error('缺少标签页 ID');
    }
    
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
    addLog(`开始获取页面内容，标签页 ID: ${tabId}`);
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

    // 保存到 Notion
    addLog('正在保存到 Notion...');
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify(notionData)
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(`Notion页面创建失败: ${result.message || response.status}`);
    }

    addLog('内容成功保存到 Notion');
    
    // 清理本地存储
      await chrome.storage.local.remove(['keywords']);
      addLog('已清理本地存储的关键词');

    sendResponse({
      success: true,
      message: '保存成功' + (cloudflareImageUrl ? '' : ' (仅文本内容)'),
      notionPageId: result.id
    });

  } catch (error) {
    addLog(`处理失败: ${error.message}`, 'error');
    sendResponse({
      success: false,
      message: error.message
    });
  }
}

// 7. 消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request.action, '发送者:', sender);

  // 如果是从 popup 发送的消息，需要先获取当前活动标签页
  const handleWithActiveTab = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('无法获取当前标签页');
      }
      return tab.id;
    } catch (error) {
      console.error('获取活动标签页失败:', error);
      throw error;
    }
  };

  switch (request.action) {
    case 'fetchImage':
      if (!request.url) {
        sendResponse({ success: false, error: '缺少图片 URL' });
        return true;
      }
      fetchImage(request.url, request.headers || {})
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'getPageContent':
      // 如果是从内容脚本发送的消息，使用 sender.tab.id
      // 如果是从 popup 发送的消息，获取当前活动标签页
      if (sender?.tab?.id) {
        getPageContent(sender.tab.id)
          .then(response => sendResponse(response))
          .catch(error => sendResponse({ success: false, error: error.message }));
      } else {
        handleWithActiveTab()
          .then(tabId => getPageContent(tabId))
          .then(response => sendResponse(response))
          .catch(error => sendResponse({ success: false, error: error.message }));
      }
      return true;

    case 'processAndSave':
      // 同样处理来自 popup 的消息
      if (sender?.tab?.id) {
        handleSaveRequest(sender.tab.id, sendResponse);
      } else {
        handleWithActiveTab()
          .then(tabId => handleSaveRequest(tabId, sendResponse))
          .catch(error => sendResponse({ 
            success: false, 
            error: error.message 
          }));
      }
      return true;

    case 'getLogs':
      sendResponse(logs);
      return true;

    default:
      console.log('未知的操作类型:', request.action);
      sendResponse({ success: false, error: '未知的操作类型' });
      return true;
  }
});
