document.addEventListener('DOMContentLoaded', async () => {
  const btn = document.getElementById('saveBtn');
  const viewLogsBtn = document.getElementById('viewLogs');
  const statusDiv = document.getElementById('status');
  const logsDiv = document.getElementById('logs');
  let logsVisible = false;

  // 检查配置
  async function checkConfig() {
    const config = await chrome.storage.sync.get(['deepseekKey', 'notionToken', 'notionDbId']);
    if (!config.deepseekKey || !config.notionToken || !config.notionDbId) {
      statusDiv.style.display = 'block';
      statusDiv.textContent = '请先在扩展选项中配置API';
      statusDiv.style.background = '#f8d7da';
      btn.disabled = true;
      return false;
    }
    btn.disabled = false;
    return true;
  }

  // 初始检查配置
  await checkConfig();

  // 保存按钮逻辑
  btn.addEventListener('click', async () => {
    // 再次检查配置
    if (!await checkConfig()) {
      return;
    }

    statusDiv.style.display = 'block';
    statusDiv.textContent = '处理中...';
    statusDiv.style.background = '#fff3cd';
    logsDiv.style.display = 'none';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.runtime.sendMessage({
        action: 'processAndSave',
        tabId: tab.id
      });

      if (response.success) {
        statusDiv.textContent = '保存成功 ✓';
        statusDiv.style.background = '#d4edda';
      } else {
        throw new Error(response.error || '保存失败');
      }
    } catch (error) {
      statusDiv.textContent = `错误: ${error.message}`;
      statusDiv.style.background = '#f8d7da';
    }
    
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  });

  // 日志按钮逻辑
  viewLogsBtn.addEventListener('click', async () => {
    logsVisible = !logsVisible;
    logsDiv.style.display = logsVisible ? 'block' : 'none';
    viewLogsBtn.textContent = logsVisible ? '隐藏日志' : '查看日志';
    
    if (logsVisible) {
      try {
        const logs = await chrome.runtime.sendMessage({ 
          action: 'getLogs' 
        });
        
        logsDiv.innerHTML = logs
          .map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message}`)
          .join('<br>');
      } catch (error) {
        logsDiv.textContent = '无法获取日志: ' + error.message;
      }
    }
  });

  // 监听来自后台的日志更新
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'newLog' && logsVisible) {
      const logEntry = `[${new Date(message.timestamp).toLocaleTimeString()}] ${message.text}`;
      logsDiv.innerHTML += `<br>${logEntry}`;
      logsDiv.scrollTop = logsDiv.scrollHeight;
    }
  });
});
