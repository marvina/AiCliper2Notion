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
  
  console.log('未知的操作类型:', request.action);
  sendResponse({ success: false, error: '未知的操作类型' });
  return true;
});

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