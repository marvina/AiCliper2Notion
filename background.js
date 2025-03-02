// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('后台收到消息:', request);
  
  if (request.action === 'fetchImage') {
    console.log('处理获取图片请求:', request.url);
    
    fetchImage(request.url, request.headers)
      .then(result => {
        console.log('图片获取成功，准备发送响应');
        sendResponse(result);
      })
      .catch(error => {
        console.error('获取图片出错:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // 表示将异步发送响应
  }
  
  // 对于其他类型的消息，返回错误
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