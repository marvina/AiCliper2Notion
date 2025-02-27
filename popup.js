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

    if (message.action === 'newLog') {
      const logMessage = message.text;

      const steps = [
        { message: '开始获取页面内容', percentage: 25 },
        { message: '开始内容摘要处理', percentage: 50 },
        { message: '正在保存到Notion...', percentage: 75 },
        { message: '保存成功', percentage: 100 }
      ];

      const currentStepIndex = steps.findIndex(step => step.message === logMessage);

      if (currentStepIndex !== -1) {
        const currentStep = steps[currentStepIndex];
        btn.style.setProperty('--progress', `${currentStep.percentage}%`);
        btn.textContent = logMessage;
      }
    }
  });
});
