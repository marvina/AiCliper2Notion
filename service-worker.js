let config = {};
const MAX_LOG_ENTRIES = 100;
let logs = [];

// 初始化配置
chrome.storage.sync.get([
  'aiProvider', 'aiApiKey', 'aiApiEndpoint', 'aiModel',
  'notionToken', 'notionDbId'
], (result) => {
  config = result;
  console.log('加载配置:', {
    aiProvider: config.aiProvider || '未设置',
    aiApiKey: config.aiApiKey ? '已设置' : '未设置',
    notionToken: config.notionToken ? '已设置' : '未设置',
    notionDbId: config.notionDbId || '未设置'
  });
});

// 监听配置变化
chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) {
    config[key] = newValue;
  }
});

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
});

async function handleSaveRequest(tabId, sendResponse) {
  try {
    addLog('开始处理保存请求');
    
    // 检查配置
    if (!config.aiApiKey || !config.aiApiEndpoint || !config.aiModel || 
        !config.notionToken || !config.notionDbId) {
      throw new Error('请先完成 AI 和 Notion 配置');
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
            title: [{ text: { content: pageData.title || '无标题' } }]
          };
          break;
        case 'url':
          notionData.properties[key] = { url: pageData.url };
          break;
        case 'rich_text':
          if (key.includes('摘要') || key.includes('Summary')) {
            notionData.properties[key] = {
              rich_text: [{ text: { content: processedContent.summary } }]
            };
          } else if (key.includes('亮点') || key.includes('Highlights')) {
            notionData.properties[key] = {
              rich_text: [{ text: { content: processedContent.outline } }]
            };
          }
          break;
        case 'date':
          notionData.properties[key] = {
            date: { start: new Date().toISOString() }
          };
          break;
        case 'files':
          if (pageData.image) {
            notionData.properties[key] = {
              files: [{ name: 'cover', external: { url: pageData.image } }]
            };
          }
          break;
      }
    }

    // 添加调试日志
    addLog('数据库字段映射:', {
      title: Object.keys(schema).find(key => schema[key].type === 'title'),
      summary: Object.keys(schema).find(key => schema[key].type === 'rich_text' && (key.includes('摘要') || key.includes('Summary'))),
      highlights: Object.keys(schema).find(key => schema[key].type === 'rich_text' && (key.includes('亮点') || key.includes('Highlights')))
    });

    // 保存到Notion
    addLog('正在保存到Notion...');
    addLog('保存数据:', notionData);
    await saveToNotion(notionData);
    
    sendResponse({ success: true });
    addLog('保存成功');
  } catch (error) {
    addLog(`保存失败: ${error.message}`, 'error');
    sendResponse({ success: false, error: error.message });
  }
}

async function getPageContent(tabId) {
  try {
    const client = await chrome.tabs.get(tabId);
    if (!client) throw new Error('客户端不可用');
    
    // 通过注入脚本访问页面DOM
    const [detailContent] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
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
          'main',
          '.article',
          '.post',
          '.blog-post',
          '.markdown-body'  // GitHub 风格的内容
        ];

        // 查找主图片
        const mainImage = document.querySelector('meta[property="og:image"]')?.content ||
                         document.querySelector('meta[name="twitter:image"]')?.content ||
                         document.querySelector('article img')?.src || '';

        // 按优先级查找内容区域
        let mainContent = null;
        let maxTextLength = 0;

        // 首先尝试使用选择器
        for (const selector of contentSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const text = element.innerText.trim();
            if (text.length > maxTextLength) {
              mainContent = element;
              maxTextLength = text.length;
            }
          }
        }

        // 如果没找到合适的内容区域，尝试查找最长的文本块
        if (!mainContent || maxTextLength < 100) {
          const elements = document.querySelectorAll('div, section, article');
          elements.forEach(element => {
            // 排除导航、页脚等区域
            if (!/nav|header|footer|sidebar|comment|menu/i.test(element.className)) {
              const text = element.innerText.trim();
              if (text.length > maxTextLength) {
                mainContent = element;
                maxTextLength = text.length;
              }
            }
          });
        }

        // 如果还是没找到，使用 body
        if (!mainContent) {
          mainContent = document.body;
        }

        // 清理和格式化内容
        let content = mainContent.innerText;

        // 移除脚本和样式标签内容
        content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

        // 清理多余空白
        content = content.replace(/[\n\r]+/g, '\n')  // 统一换行符
                        .replace(/[\n]{3,}/g, '\n\n')  // 最多保留两个连续换行
                        .replace(/[ \t]+/g, ' ')  // 合并空格
                        .trim();

        // 移除可能的广告和无关文本
        content = content.split('\n')
                        .filter(line => {
                          const l = line.trim();
                          return l.length > 0 && 
                                 !/^广告$|^分享$|^评论$|^[0-9]+条评论$/i.test(l);
                        })
                        .join('\n');

        // 返回提取的内容信息
        return {
          title: title.trim(),
          content: content.substring(0, 10000), // 限制内容长度
          contentLength: content.length,
          image: mainImage,
          url: url.split('?')[0], // 去除URL参数
          debug: {
            foundSelector: mainContent.tagName + (mainContent.className ? '.' + mainContent.className : ''),
            textLength: maxTextLength
          }
        };
      }
    });

    return detailContent.result || '内容获取失败';

  } catch (error) {
    console.error('[内容获取]', error);
    throw new Error('无法获取页面内容');
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
      throw new Error(`获取数据库结构失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.properties;
  } catch (error) {
    addLog(`获取数据库结构失败: ${error.message}`, 'error');
    throw error;
  }
}

async function processContent(content) {
  try {
    const response = await fetch(config.aiApiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.aiApiKey}`
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages: [
          {
            role: 'user',
            content: `请为以下内容生成摘要:\n${content}`
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      throw new Error(`内容处理失败: ${response.statusText}`);
    }

    const data = await response.json();
    const resultText = data.choices[0].message.content;

    // 提取总结部分
    const summaryMatch = resultText.match(/全文总结[：:]([\s\S]*?)(?=\n\d+\.|$)/);
    let summary = summaryMatch ? summaryMatch[1].trim() : '无法提取总结';

    // 提取亮点部分
    const outlineMatch = resultText.match(/重要亮点[：:]([\s\S]*?)$/);
    let outline = outlineMatch ? outlineMatch[1].trim() : '无法提取重要亮点';

    return {
      summary,
      outline
    };
  } catch (error) {
    addLog(`内容处理失败: ${error.message}`, 'error');
    throw error;
  }
}

async function saveToNotion(data) {
  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.notionToken}`,
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`保存到Notion失败: ${error.message}`);
    }
  } catch (error) {
    addLog(`保存到Notion失败: ${error.message}`, 'error');
    throw error;
  }
}
