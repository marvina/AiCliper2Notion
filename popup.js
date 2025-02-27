document.addEventListener('DOMContentLoaded', async () => {
  const btn = document.getElementById('saveBtn');
  const viewLogsBtn = document.getElementById('viewLogs');
  const logsDiv = document.getElementById('logs');
  let logsVisible = false;

  // 检查配置
  async function checkConfig() {
    const config = await chrome.storage.sync.get(['deepseekKey', 'notionToken', 'notionDbId']);
    if (!config.deepseekKey || !config.notionToken || !config.notionDbId) {
      alert('请先在扩展选项中配置API');
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

    logsDiv.style.display = 'none';
    btn.classList.add('progress');
    btn.style.setProperty('--progress', '0%');
    btn.textContent = '保存到 Notion';

    let tab, response;
    try {
      // 获取当前标签页
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs[0];
      
      // 定义进度更新函数
      const startTime = Date.now();
      const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        const percentage = Math.min((elapsed / 15000) * 100, 100); // 假设总时长为15秒
        btn.style.setProperty('--progress', `${percentage}%`);
        btn.textContent = percentage === 100 ? '保存成功' : `保存中 ${Math.floor(percentage)}%`;
        
        if (percentage < 100 && !response) {
          requestAnimationFrame(updateProgress);
        }
      };
      
      // 启动进度更新
      updateProgress();
      
      // 执行保存操作
      response = await chrome.runtime.sendMessage({
        action: 'processAndSave',
        tabId: tab.id
      });

      if (!response.success) {
        throw new Error(response.error || '保存失败');
      }
      
      btn.textContent = '保存成功'; // 更新按钮文本
    } catch (error) {
      alert(`错误: ${error.message}`);
      btn.textContent = '保存失败'; // 更新按钮文本为错误信息
    } finally {
      // 确保进度条最终状态为100%
      btn.style.setProperty('--progress', '100%');
    }
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
