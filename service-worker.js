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
    
    // 使用 cloudflareService 上传
    const cloudflareUrl = await cloudflareService.uploadImage(imageUrl);
    
    addLog(`图片上传成功: ${cloudflareUrl}`);
    return cloudflareUrl;
  } catch (error) {
    addLog(`图片上传失败: ${error.message}`, 'error');
    throw error;
  }
}

// 添加新函数：获取已上传的图片 URL
async function getCloudflareImageUrl(imageUrl) {
  try {
    // 检查配置
    if (!config.cloudflareAccountId || !config.cloudflareApiToken || !config.cloudflareImageId) {
      throw new Error('缺少 Cloudflare 配置');
    }

    // 构建查询 URL
    const searchParams = new URLSearchParams({
      url: imageUrl
    });
    
    const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/images/v1/search?${searchParams}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.cloudflareApiToken}`
      }
    });

    if (!response.ok) {
      throw new Error('查询图片失败');
    }

    const data = await response.json();
    
    // 如果找到匹配的图片，返回其 Cloudflare URL
    if (data.success && data.result.length > 0) {
      addLog(`找到已上传的图片: ${data.result[0].filename}`);
      return data.result[0].variants[0];
    }
    
    // 如果没找到，返回 null
    return null;
  } catch (error) {
    addLog(`查询图片失败: ${error.message}`, 'warning');
    return null;
  }
}

// 修改 processImages 函数
async function processImages(images) {
  try {
    if (!Array.isArray(images) || images.length === 0) {
      addLog('没有图片需要处理');
      return [];
    }

    addLog(`开始处理 ${images.length} 张图片`);
    
    // 处理每张图片
    const processPromises = images.map(async (imageUrl, index) => {
      try {
        addLog(`处理第 ${index + 1}/${images.length} 张图片: ${imageUrl}`);
        
        // 先查找是否已上传
        const existingUrl = await getCloudflareImageUrl(imageUrl);
        if (existingUrl) {
          addLog(`使用已上传的图片: ${existingUrl}`);
          return existingUrl;
        }
        
        // 如果没有找到，则上传新图片
        addLog(`开始上传新图片: ${imageUrl}`);
        const uploadedUrl = await uploadImageToCloudflare(imageUrl);
        addLog(`新图片上传成功: ${uploadedUrl}`);
        return uploadedUrl;
      } catch (error) {
        addLog(`第 ${index + 1} 张图片处理失败: ${error.message}`, 'warning');
        return null;
      }
    });

    const results = await Promise.all(processPromises);
    const successfulUploads = results.filter(Boolean);
    
    addLog(`图片处理完成，成功处理 ${successfulUploads.length}/${images.length} 张`);
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

// 5. 内容总结处理函数
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
    
    // 新增标签页状态检查
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.active) {
      throw new Error('目标标签页未激活或已关闭');
    }

    return new Promise((resolve, reject) => {
      // 添加内容脚本注入保障
      const ensureContentScript = async () => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
          });
          await new Promise(r => setTimeout(r, 500));
          } catch (e) {
          reject(new Error('内容脚本注入失败'));
        }
      };

      chrome.tabs.sendMessage(tabId, {
        action: 'getPageContent'
      }, async response => {  // ✅ 修复开始：补全回调结构
        if (chrome.runtime.lastError) {
          await ensureContentScript();
          chrome.tabs.sendMessage(tabId, {
            action: 'getPageContent' 
          }, secondResponse => {
            if (chrome.runtime.lastError) {
              reject(new Error('无法建立通信连接'));
              return;
            }
            // 处理第二次响应
            if (!secondResponse || !secondResponse.success) {
              reject(new Error(secondResponse?.error || '内容提取失败'));
              return;
            }
            resolve(secondResponse);
          });
          return;
        }

        // 处理原始响应
        if (!response || !response.success) {
          reject(new Error(response?.error || '内容提取失败'));
          return;
        }
        resolve(response);  // ✅ 补全缺失的 resolve
      });  // ✅ 修复结束：补全回调函数
    });
  } catch (error) {
    addLog(`内容提取失败: ${error.message}`, 'error');
    throw error;
  }
}

// 6. 主要处理保存函数
async function handleSaveRequest(tabId, sendResponse) {
  try {
    addLog('开始处理保存请求');
    addLog(`处理标签页 ID: ${tabId}`);

    if (!tabId) {
      throw new Error('缺少标签页 ID');
    }
    
    // 检查配置
    if (!config.aiApiKey || !config.notionToken || !config.notionDbId) {
      throw new Error('请先完成必要配置');
    }

    // 获取数据库结构
    addLog('获取数据库结构...');
    const schema = await getDatabaseSchema(config.notionDbId);
    addLog('数据库结构:', schema);

    // 获取页面内容
    addLog(`开始获取页面内容，标签页 ID: ${tabId}`);
    const pageData = await getPageContent(tabId);
    
    // 即使内容提取失败，仍继续处理
    if (!pageData?.success) {
      addLog('内容提取失败，将只保存 AI 处理结果', 'warning');
    }

    // 内容处理 - 使用提取的内容或空字符串
    addLog('开始内容摘要处理');
    const processedContent = await processContent(pageData?.content || '');
    
    // 处理图片
    let processedImages = [];
    if (pageData?.images?.length > 0) {
      addLog(`开始处理 ${pageData.images.length} 张图片`);
      processedImages = await processImages(pageData.images);
    }

    // 构建 Notion 数据
    const notionData = {
      parent: { database_id: config.notionDbId },
      properties: {}
    };

    // 根据数据库结构构建属性
    for (const [key, prop] of Object.entries(schema)) {
      switch (prop.type) {
        case 'title':
          notionData.properties[key] = {
            title: [{ text: { content: (pageData?.title || '无标题').slice(0, 30) } }]
          };
          break;
        case 'url':
          notionData.properties[key] = { url: pageData?.url || window.location.href };
          break;
        case 'rich_text':
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
              rich_text: [{ text: { content: processedContent.keywords } }]
            };
          }
          break;
        case 'date':
          notionData.properties[key] = {
            date: { start: new Date().toISOString() }
          };
          break;
      }
    }

    // 构建 Notion 内容块
    const children = [];
    
    // 添加标题块
    children.push({
      object: 'block',
      type: 'heading_1',
      heading_1: {
        rich_text: [{ type: 'text', text: { content: pageData?.title || '无标题' } }]
      }
    });

    // 添加 AI 处理结果
    if (processedContent.summary) {
      children.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '内容摘要' } }]
        }
      }, {
        object: 'block',
            type: 'paragraph',
            paragraph: {
          rich_text: [{ type: 'text', text: { content: processedContent.summary } }]
        }
      });
    }

    // 添加图片
    if (processedImages.length > 0) {
      children.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '相关图片' } }]
        }
      });

      // 添加每张图片
      for (const imageUrl of processedImages) {
        children.push({
          object: 'block',
          type: 'image',
          image: {
            type: 'external',
            external: { url: imageUrl }
          }
        });
      }
    }

    // 更新 notionData，添加 children
    notionData.children = children;

    // 保存到 Notion - 不包含原始内容
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

    addLog('AI 处理结果已保存到 Notion');
    sendResponse({
      success: true,
      message: pageData?.success ? '完整保存成功' : '仅保存 AI 处理结果',
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
// 在消息监听回调中补全闭合
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
