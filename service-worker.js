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
    addLog(`开始上传图片到 Cloudflare: ${imageUrl}`);
    
    // 检查 URL 是否有效
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
      addLog(`无效的图片 URL: ${imageUrl}`, 'warning');
      return imageUrl;
    }
    
    // 检查是否已经是 Cloudflare URL
    if (imageUrl.includes('imagedelivery.net') || 
        imageUrl.includes('r2.cloudflarestorage.com')) {
      addLog(`图片已经在 Cloudflare 上，跳过上传: ${imageUrl}`);
      return imageUrl;
    }
    
    addLog(`正在获取图片数据: ${imageUrl}`);
    
    // 获取图片数据
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      addLog(`获取图片失败: ${imageUrl} - HTTP ${response.status}`, 'error');
      return imageUrl;
    }
    
    const contentType = response.headers.get('content-type');
    addLog(`图片类型: ${contentType}`);
    
    if (!contentType || !contentType.startsWith('image/')) {
      addLog(`非图片内容: ${imageUrl} - ${contentType}`, 'warning');
      return imageUrl;
    }
    
    const blob = await response.blob();
    addLog(`获取到图片数据: ${blob.size} 字节`);
    
    // 上传到 Cloudflare
    addLog(`开始上传到 Cloudflare...`);
    const cloudflareUrl = await cloudflareService.uploadImage(imageUrl, blob);
    
    if (!cloudflareUrl || cloudflareUrl === imageUrl) {
      addLog(`上传到 Cloudflare 失败，使用原始 URL: ${imageUrl}`, 'warning');
      return imageUrl;
    }
    
    addLog(`上传成功: ${imageUrl} -> ${cloudflareUrl}`);
    return cloudflareUrl;
  } catch (error) {
    addLog(`上传图片时出错: ${error.message}`, 'error');
    return imageUrl; // 出错时返回原始URL
  }
}

// 处理所有图片上传
async function processImages(images) {
  const processedImages = [];
  addLog(`开始处理 ${images.length} 张图片`);
  
  // 添加进度跟踪
  let processed = 0;
  const total = images.length;
  
  for (const imageUrl of images) {
    try {
      processed++;
      addLog(`处理图片 [${processed}/${total}]: ${imageUrl}`);
      
      const cloudflareUrl = await uploadImageToCloudflare(imageUrl);
      processedImages.push(cloudflareUrl);
      
      if (cloudflareUrl !== imageUrl) {
        addLog(`图片处理成功: ${imageUrl} -> ${cloudflareUrl}`);
      } else {
        addLog(`图片保持原样: ${imageUrl}`, 'warning');
      }
    } catch (error) {
      addLog(`处理图片失败: ${imageUrl} - ${error.message}`, 'warning');
      processedImages.push(imageUrl); // 如果上传失败，使用原始URL
    }
  }
  
  addLog(`图片处理完成，共 ${processedImages.length} 张`);
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
    addLog(`获取到的图片数量: ${pageData.images?.length || 0}`);
    
    if (pageData.images && pageData.images.length > 0) {
      addLog(`图片列表: ${JSON.stringify(pageData.images.slice(0, 3))}...`);
    }
    
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
    
    // 处理图片上传 - 确保所有图片都上传到 Cloudflare
    let cloudflareImageUrl = '';
    let processedImages = [];
    
    if (pageData.images && pageData.images.length > 0) {
      addLog(`开始处理${pageData.images.length}张图片...`);
      
      // 确保所有图片都是有效的 URL
      const validImages = pageData.images.filter(url => 
        url && typeof url === 'string' && url.startsWith('http')
      );
      
      if (validImages.length !== pageData.images.length) {
        addLog(`过滤掉 ${pageData.images.length - validImages.length} 个无效图片 URL`, 'warning');
      }
      
      if (validImages.length === 0) {
        addLog('没有有效的图片可以处理', 'warning');
      } else {
        try {
          // 处理所有有效图片
          addLog(`开始上传 ${validImages.length} 张图片到 Cloudflare...`);
          
          // 逐个处理图片，确保每张图片都有机会上传
          for (let i = 0; i < validImages.length; i++) {
            const imageUrl = validImages[i];
            try {
              addLog(`处理图片 ${i+1}/${validImages.length}: ${imageUrl}`);
              const cloudflareUrl = await uploadImageToCloudflare(imageUrl);
              
              if (cloudflareUrl && cloudflareUrl !== imageUrl) {
                addLog(`图片上传成功: ${imageUrl} -> ${cloudflareUrl}`);
                processedImages.push(cloudflareUrl);
              } else {
                addLog(`图片上传失败或未更改，使用原始 URL: ${imageUrl}`, 'warning');
                processedImages.push(imageUrl);
              }
            } catch (imgError) {
              addLog(`处理图片时出错: ${imgError.message}`, 'error');
              // 出错时使用原始 URL
              processedImages.push(imageUrl);
            }
          }
          
          // 验证处理后的图片 URL
          processedImages = processedImages.filter(url => {
            const isValid = url && typeof url === 'string' && url.startsWith('http');
            if (!isValid) {
              addLog(`过滤无效的处理后图片 URL: ${url}`, 'warning');
            }
            return isValid;
          });
          
          // 使用第一张处理后的图片作为封面
          if (processedImages.length > 0) {
            cloudflareImageUrl = processedImages[0];
            addLog(`设置封面图片: ${cloudflareImageUrl}`);
          } else {
            addLog('警告: 没有有效的图片可用作封面', 'warning');
          }
        } catch (imageError) {
          addLog(`处理图片时出错: ${imageError.message}`, 'error');
          // 出错时使用空数组，不中断整个流程
          processedImages = [];
        }
      }
    } else {
      addLog('页面没有图片需要处理');
    }

    // 构建Notion数据
    addLog('构建 Notion 数据...');
    const notionData = {
      parent: { database_id: config.notionDbId },
      properties: {}
    };

    // 映射字段
    addLog('数据库字段映射:');
    for (const [fieldName, fieldType] of Object.entries(schema)) {
      addLog(`  ${fieldName}: ${fieldType}`);
      
      // 根据字段类型设置值
      switch (fieldType) {
        case 'title':
          notionData.properties[fieldName] = {
            title: [{ text: { content: pageData.title } }]
          };
          break;
        case 'rich_text':
          notionData.properties[fieldName] = {
            rich_text: [{ text: { content: processedContent.summary.substring(0, 2000) } }]
          };
          break;
        case 'url':
          notionData.properties[fieldName] = {
            url: pageData.url
          };
          break;
        case 'multi_select':
          // 处理关键词为多选标签
          const keywordArray = keywords.split(',').map(k => k.trim()).filter(Boolean);
          notionData.properties[fieldName] = {
            multi_select: keywordArray.map(name => ({ name }))
          };
          break;
        case 'files':
          // 处理封面图片 - 确保 URL 有效
          if (cloudflareImageUrl && cloudflareImageUrl.startsWith('http')) {
            try {
              // 验证 URL 是否可访问
              const testResponse = await fetch(cloudflareImageUrl, { method: 'HEAD' });
              if (testResponse.ok) {
                notionData.properties[fieldName] = {
                  files: [
                    {
                      name: "封面图片",
                      type: "external",
                      external: {
                        url: cloudflareImageUrl
                      }
                    }
                  ]
                };
                addLog(`添加封面图片: ${cloudflareImageUrl}`);
              } else {
                addLog(`封面图片 URL 不可访问: ${cloudflareImageUrl}`, 'warning');
                notionData.properties[fieldName] = { files: [] };
              }
            } catch (urlError) {
              addLog(`验证封面图片 URL 时出错: ${urlError.message}`, 'warning');
              notionData.properties[fieldName] = { files: [] };
            }
          } else {
            addLog('没有有效的封面图片，使用空数组');
            notionData.properties[fieldName] = { files: [] };
          }
          break;
        default:
          // 其他字段类型处理
          addLog(`未处理的字段类型: ${fieldType} (${fieldName})`, 'warning');
      }
    }

    // 添加页面内容
    addLog('添加页面内容...');
    
    // 确保摘要内容存在
    if (!processedContent.summary) {
      addLog('警告: 摘要内容为空', 'warning');
      processedContent.summary = pageData.content.substring(0, 1000) + '...';
    }
    
    // 添加摘要段落
    notionData.children = [
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: processedContent.summary
              }
            }
          ]
        }
      }
    ];
    
    // 添加亮点列表
    if (processedContent.outline) {
      addLog('添加亮点列表...');
      
      // 添加亮点标题
      notionData.children.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              type: "text",
              text: {
                content: "重要亮点"
              }
            }
          ]
        }
      });
      
      // 添加亮点内容
      const outlinePoints = processedContent.outline.split('\n')
        .filter(line => line.trim())
        .map(line => line.replace(/^\d+\.\s*/, '').trim());
      
      for (const point of outlinePoints) {
        notionData.children.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: point
                }
              }
            ]
          }
        });
      }
    }
    
    // 添加原文链接
    notionData.children.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "原文链接: "
            }
          },
          {
            type: "text",
            text: {
              content: pageData.url
            },
            link: {
              url: pageData.url
            }
          }
        ]
      }
    });

    // 添加图片块 - 使用更安全的方式
    if (processedImages && processedImages.length > 0) {
      addLog(`准备添加 ${processedImages.length} 张图片到 Notion 页面`);
      
      // 添加图片标题
      notionData.children.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              type: "text",
              text: {
                content: "图片"
              }
            }
          ]
        }
      });
      
      // 限制图片数量，避免请求过大
      const maxImages = Math.min(processedImages.length, 10);
      if (maxImages < processedImages.length) {
        addLog(`限制图片数量为 ${maxImages} (原有 ${processedImages.length} 张)`, 'warning');
      }
      
      for (let i = 0; i < maxImages; i++) {
        const imageUrl = processedImages[i];
        try {
          // 验证 URL 是否可访问
          const testResponse = await fetch(imageUrl, { method: 'HEAD' });
          if (testResponse.ok) {
            notionData.children.push({
              object: "block",
              type: "image",
              image: {
                type: "external",
                external: {
                  url: imageUrl
                }
              }
            });
            addLog(`添加图片块 #${i+1}: ${imageUrl}`);
          } else {
            addLog(`图片 URL 不可访问，跳过: ${imageUrl}`, 'warning');
          }
        } catch (urlError) {
          addLog(`验证图片 URL 时出错，跳过: ${urlError.message}`, 'warning');
        }
      }
    }

    // 保存到Notion
    addLog('发送数据到Notion...');
    
    // 添加请求详情日志
    addLog('Notion 请求数据:', {
      endpoint: `https://api.notion.com/v1/pages`,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer [已隐藏]',
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: {
        parent: notionData.parent,
        properties: Object.keys(notionData.properties),
        children_count: notionData.children?.length || 0
      }
    });
    
    addLog('正在保存到Notion...');
    
    const notionResponse = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(notionData)
    });

    const notionResult = await notionResponse.json();
    
    if (!notionResponse.ok) {
      addLog('Notion API 错误:', notionResult);
      throw new Error(`Notion页面创建失败: ${notionResult.message || notionResponse.status}`);
    }

    addLog('Notion页面创建成功');
    addLog('Notion响应:', notionResult);

    // 返回结果
    sendResponse({
      success: true,
      message: '内容已保存到Notion',
      notionPageId: notionResult.id,
      notionPageUrl: notionResult.url
    });
  } catch (error) {
    addLog(`处理失败: ${error.message}`, 'error');
    sendResponse({
      success: false,
      message: error.message
    });
  }
}

async function getPageContent(tabId) {
  try {
    addLog('开始获取页面内容');
    
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
    try {
      return await getPageContentFallback(tabId);
    } catch (fallbackError) {
      addLog(`备用方法也失败了: ${fallbackError.message}`, 'error');
      throw error; // 抛出原始错误
    }
  }
}

// 添加一个备用的内容提取函数
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
