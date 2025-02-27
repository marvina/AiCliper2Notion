document.addEventListener('DOMContentLoaded', async () => {
  const btn = document.getElementById('saveBtn');
  const viewLogsBtn = document.getElementById('viewLogs');
  const logsDiv = document.getElementById('logs');
  let logsVisible = false;
  let taskStarted = false;

  // 检查配置
  async function checkConfig() {
    const config = await chrome.storage.sync.get(['aiApiKey', 'notionToken', 'notionDbId']);
    if (!config.aiApiKey || !config.notionToken || !config.notionDbId) {
      alert('请先在扩展选项中配置API');
      btn.disabled = true;
      return false;
    }
    btn.disabled = false;
    return true;
  }

  function updateProgress(percent) {
    // 确保progress-bar元素存在
    let progressBar = btn.querySelector('.progress-bar');
    let progressText = btn.querySelector('.progress-text');
    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      btn.appendChild(progressBar);
    }
    
    // 确保span元素存在
    let btnSpan = btn.querySelector('span');
    if (!btnSpan) {
      btnSpan = document.createElement('span');
      btn.insertBefore(btnSpan, progressBar);
    }
    
    // 确保progress-text元素存在
    if (!progressText) {
      progressText = document.createElement('span');
      progressText.className = 'progress-text';
      btnSpan.appendChild(progressText);
    }
    
    // 设置进度条状态
    btn.classList.add('progress');
    progressBar.style.transition = 'width 0.5s ease';
    progressBar.style.width = `${percent}%`;
    
    // 更新进度文本 - 始终显示百分比
    progressText.textContent = ` ${Math.round(percent)}%`;
    
    // 只有当进度为100%时才清除进度文本，但保持进度条显示
    if (percent >= 100) {
      setTimeout(() => {
        // 不再重置进度条宽度
        // progressBar.style.width = '0';
        btn.classList.remove('progress');
        progressText.textContent = '';
      }, 1000);
    }
  }

  // 监听后台消息
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'taskCompleted') {
      updateProgress(100);
      // 移除重置进度条的代码
      // setTimeout(() => {
      //   updateProgress(0);
      // }, 1000);
    }
  });

  // 初始检查配置
  await checkConfig();

  // 保存按钮逻辑
  btn.addEventListener('click', async () => {
    // 再次检查配置
    if (!await checkConfig()) {
      return;
    }
  
    logsDiv.style.display = 'none';
    
    // 重置按钮内容，确保HTML结构正确
    btn.innerHTML = '<span>保存到 Notion<span class="progress-text"></span></span><div class="progress-bar"></div>';
    
    // 初始化进度为0%
    updateProgress(0);
    
    taskStarted = true; // 标记任务开始
  
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
      
      // 更新按钮文本，保留HTML结构
      const btnSpan = btn.querySelector('span');
      if (btnSpan) {
        btnSpan.innerHTML = '保存成功<span class="progress-text"></span>';
      }
      updateProgress(100);
    } catch (error) {
      alert(`错误: ${error.message}`);
      const btnSpan = btn.querySelector('span');
      if (btnSpan) {
        btnSpan.innerHTML = '保存失败<span class="progress-text"></span>';
      }
      updateProgress(0);
      taskStarted = false; // 在错误时重置状态
    } finally {
      // 只有在成功时才重置状态和关闭窗口
      if (response && response.success) {
        taskStarted = false;
        setTimeout(() => window.close(), 2000);
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
        updateProgress(currentStep.percentage);
        
        // 更新按钮文本，保留HTML结构
        const btnSpan = btn.querySelector('span');
        if (btnSpan) {
          btnSpan.innerHTML = `${logMessage}<span class="progress-text"></span>`;
        }
      }
    }

    if (message.action === 'taskStarted') {
      taskStarted = true;
    }

    if (message.action === 'taskCompleted') {
      taskStarted = false;
      setTimeout(() => window.close(), 2000);
    }

    // 添加错误处理
    if (message.action === 'taskError') {
      taskStarted = false;
      updateProgress(0);
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

  // 阻止点击外部关闭窗口
  window.addEventListener('blur', () => {
    if (!taskStarted) {
      window.close();
    }
  });
});
