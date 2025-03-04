// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('后台收到消息:', request);

  if (request.action === 'fetchImage') {
    if (!request.url) {
      console.error('缺少图片 URL');
      sendResponse({ success: false, error: '缺少图片 URL' });
      return true;
    }

    console.log('处理获取图片请求:', request.url);

    fetchImage(request.url, request.headers || {})
      .then(result => {
        console.log('图片获取成功，准备发送响应');
        sendResponse(result);
      })
      .catch(error => {
        console.error('获取图片出错:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }

  if (request.action === 'getPageContent') {
    console.log('处理获取页面内容请求');

    if (!sender || !sender.tab || !sender.tab.id) {
      console.error('无法获取发送者标签页信息');
      sendResponse({ success: false, error: '无法获取发送者标签页信息' });
      return true;
    }

    try {
      // 转发消息到内容脚本
      chrome.tabs.sendMessage(sender.tab.id, request, response => {
        if (chrome.runtime.lastError) {
          console.error('发送消息错误:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        console.log('收到内容脚本响应:', response);
        sendResponse(response || { success: false, error: '内容脚本未返回响应' });
      });
    } catch (error) {
      console.error('发送消息时出错:', error);
      sendResponse({ success: false, error: error.message });
    }

    return true;
  }

  if (request.action === 'processAndSave') {
    console.log('处理保存到 Notion 请求');

    if (!sender || !sender.tab || !sender.tab.id) {
      console.error('无法获取发送者标签页信息');
      sendResponse({ success: false, error: '无法获取发送者标签页信息' });
      return true;
    }

    try {
      // 获取页面内容
      chrome.tabs.sendMessage(sender.tab.id, { action: 'getPageContent' }, async (response) => {
        if (chrome.runtime.lastError || !response.success) {
          console.error('获取页面内容失败:', chrome.runtime.lastError || response.error);
          sendResponse({ success: false, error: '获取页面内容失败' });
          return;
        }

        const { title, content, images } = response;

        // 构造 Notion 页面属性
        const pageProperties = buildNotionPageProperties(title, content, images);

        // 发送到 Notion API
        try {
          const notionResponse = await saveToNotion(pageProperties);
          console.log('Notion API 响应:', notionResponse);
          sendResponse({ success: true, message: '保存成功' });
        } catch (notionError) {
          console.error('保存到 Notion 失败:', notionError);
          sendResponse({ success: false, error: notionError.message });
        }
      });
    } catch (error) {
      console.error('处理保存请求时出错:', error);
      sendResponse({ success: false, error: error.message });
    }

    return true;
  }

  console.log('未知的操作类型:', request.action);
  sendResponse({ success: false, error: '未知的操作类型' });
  return true;
});

// 构造 Notion API 请求体
function buildNotionPageProperties(title, content) {
  const children = [];

  // 添加标题块
  if (title) {
    children.push({
      object: 'block',
      type: 'heading_1',
      heading_1: {
        rich_text: [
          {
            text: {
              content: title.substring(0, 200)
            }
          }
        ]
      }
    });
  }

  // 添加内容块（支持多段落）
  if (content) {
    const chunkSize = 2000; // 每个块的最大字符数
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.substring(i, i + chunkSize);
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              text: {
                content: chunk
              }
            }
          ]
        }
      });
    }
  }

  return {
    parent: {
      database_id: '' // 数据库 ID 将在调用时动态设置
    },
    properties: {
      title: {
        title: [
          {
            text: {
              content: title.substring(0, 200)
            }
          }
        ]
      }
    },
    children: children
  };
}

// 创建 Notion 页面
async function createNotionPage(databaseId, title, content, notionToken) {
  const pageData = buildNotionPageProperties(title, content);
  pageData.parent.database_id = databaseId;

  console.log('请求体:', JSON.stringify(pageData, null, 2));

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify(pageData)
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Notion API 错误:', errorData);
    throw new Error('创建页面失败');
  }

  return response.json();
}

// 替换原有的 saveToNotion 函数
async function saveToNotion(title, content) {
  const notionToken = await getNotionToken();
  const notionDbId = await getNotionDatabaseId();

  if (!notionToken || !notionDbId) {
    throw new Error('缺少 Notion 配置');
  }

  try {
    const result = await createNotionPage(notionDbId, title, content, notionToken);
    console.log('页面创建成功:', result);
    return result;
  } catch (error) {
    console.error('保存到 Notion 失败:', error);
    throw error;
  }
}

// 获取 Notion Token
async function getNotionToken() {
  const config = await chrome.storage.sync.get(['notionToken']);
  return config.notionToken;
}

// 获取 Notion 数据库 ID
async function getNotionDatabaseId() {
  const config = await chrome.storage.sync.get(['notionDbId']);
  return config.notionDbId;
}

// 获取图片函数
async function fetchImage(url, headers) {
  console.log('开始获取图片:', url);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
      credentials: 'omit'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const blob = await response.blob();
    console.log('图片获取成功，类型:', blob.type);

    return {
      success: true,
      blob: blob,
      contentType: blob.type || 'image/jpeg' // 默认为 JPEG 如果类型未知
    };
  } catch (error) {
    console.error('Error fetching image:', error);
    throw error;
  }
}
