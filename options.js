document.addEventListener('DOMContentLoaded', () => {
  // AI 相关元素
  const aiProvider = document.getElementById('aiProvider');
  const aiApiKey = document.getElementById('aiApiKey');
  const aiApiEndpoint = document.getElementById('aiApiEndpoint');
  const aiModel = document.getElementById('aiModel');
  const saveAiConfig = document.getElementById('saveAiConfig');
  const endpointHelp = document.querySelector('.endpoint-help');

  // Notion 相关元素
  const verifyToken = document.getElementById('verifyToken');
  const refreshBtn = document.getElementById('refreshDatabases');
  const saveNotionConfig = document.getElementById('saveNotionConfig');
  const statusDiv = document.getElementById('status');
  const inputs = {
    notionToken: document.getElementById('notionToken'),
    notionDbId: document.getElementById('notionDbId')
  };

  // AI 提供商配置
  const providerConfigs = {
    aliyun: {
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: [
        // 通义千问系列
        'qwen-plus-latest',
        'qwen-max-latest', 
        'qwen-turbo-latest',
        // DeepSeek 系列
        'deepseek-v3',
        'deepseek-r1',
        'deepseek-r1-distill-qwen-32b',
        'deepseek-r1-distill-qwen-14b',
        'deepseek-r1-distill-qwen-7b',
        'deepseek-r1-distill-qwen-1.5b'
      ],
      placeholder: '请输入以 sk- 开头的 API Key'
    },
    deepseek: {
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      models: ['deepseek-chat', 'deepseek-coder'],
      placeholder: '输入 DeepSeek API Key'
    },
    openai: {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      models: ['gpt-4', 'gpt-3.5-turbo'],
      placeholder: '输入 OpenAI API Key'
    },
    volcengine: {
      endpoint: 'https://api.volcengine.com/v1/chat/completions',
      models: ['skylark-chat', 'skylark-chat-plus'],
      placeholder: '输入火山引擎 API Key'
    }
  };

  // 加载已保存的配置
  chrome.storage.sync.get([
    'aiProvider', 'aiApiKey', 'aiApiEndpoint', 'aiModel',
    'notionToken', 'notionDbId'
  ], (config) => {
    // AI 配置
    if (config.aiProvider) {
      aiProvider.value = config.aiProvider;
      updateProviderUI(config.aiProvider);
      aiApiKey.value = config.aiApiKey || '';
      aiApiEndpoint.value = config.aiApiEndpoint || '';
      aiModel.value = config.aiModel || '';
    }

    // Notion 配置
    if (config.notionToken) inputs.notionToken.value = config.notionToken;
    if (config.notionDbId) inputs.notionDbId.value = config.notionDbId;
  });

  // 监听 Notion Token 输入变化
  inputs.notionToken.addEventListener('input', () => {
    clearInputStatus(inputs.notionToken);
    refreshBtn.disabled = true;
  });

  // 监听数据库选择变化
  inputs.notionDbId.addEventListener('change', () => {
    clearInputStatus(inputs.notionDbId);
  });

  // AI 提供商变化处理
  aiProvider.addEventListener('change', () => {
    updateProviderUI(aiProvider.value);
  });

  function updateProviderUI(provider) {
    const config = providerConfigs[provider];
    if (config) {
      aiApiEndpoint.value = config.endpoint;
      aiApiKey.placeholder = config.placeholder;
      
      // 更新模型选项
      aiModel.innerHTML = '<option value="">请选择模型</option>';
      config.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        aiModel.appendChild(option);
      });

      endpointHelp.textContent = `默认终端点：${config.endpoint}`;
    } else {
      aiApiEndpoint.value = '';
      aiApiKey.placeholder = '输入 API Key';
      aiModel.innerHTML = '<option value="">请先选择 AI 提供商</option>';
      endpointHelp.textContent = '';
    }
  }

  // 保存 AI 配置
  saveAiConfig.addEventListener('click', async () => {
    const config = {
      aiProvider: aiProvider.value,
      aiApiKey: aiApiKey.value.trim(),
      aiApiEndpoint: aiApiEndpoint.value.trim(),
      aiModel: aiModel.value
    };

    if (!config.aiProvider || !config.aiApiKey || !config.aiApiEndpoint || !config.aiModel) {
      showStatus('请完整填写 AI 配置信息', 'error');
      return;
    }

    try {
      await validateAiConfig(config);
      await chrome.storage.sync.set(config);
      showStatus('AI 配置保存成功', 'success');
    } catch (error) {
      showStatus(`AI 配置保存失败: ${error.message}`, 'error');
    }
  });

  // 添加 validateAiConfig 函数
  async function validateAiConfig(config) {
    try {
      let endpoint = config.aiApiEndpoint;
      
      // 验证 API Key 格式（仅阿里云）
      if (config.aiProvider === 'aliyun') {
        if (!config.aiApiKey.startsWith('sk-')) {
          throw new Error('阿里云 API Key 必须以 sk- 开头');
        }
      }

      // 根据不同提供商构建不同的请求体
      let requestBody = {
        model: config.aiModel,
        messages: [
          {
            role: 'user',
            content: 'test'
          }
        ]
      };

      // 阿里云特定参数
      if (config.aiProvider === 'aliyun') {
        requestBody = {
          ...requestBody,
          stream: false,
          max_tokens: 100,
          temperature: 0.7,
          top_p: 0.9
        };
      }

      console.log('验证请求:', {
        endpoint,
        model: config.aiModel,
        provider: config.aiProvider,
        body: requestBody
      });

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': config.aiApiKey  // 阿里云直接使用 API Key
      };

      const response = await fetch(endpoint + '/chat/completions', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      const responseData = await response.text();
      console.log('API响应:', responseData);

      if (!response.ok) {
        const errorData = JSON.parse(responseData);
        setInputStatus(aiApiKey, 'error');
        throw new Error(errorData.error?.message || errorData.message || `API错误: ${response.status}`);
      }

      setInputStatus(aiApiKey, 'success');
      return true;
    } catch (error) {
      console.error('AI配置验证失败:', error);
      setInputStatus(aiApiKey, 'error');
      throw error;
    }
  }

  // 保存 Notion 配置
  saveNotionConfig.addEventListener('click', async () => {
    const config = {
      notionToken: inputs.notionToken.value.trim(),
      notionDbId: inputs.notionDbId.value.trim()
    };

    if (!config.notionToken || !config.notionDbId) {
      showStatus('请完整填写 Notion 配置信息', 'error');
      return;
    }

    try {
      // 验证 Notion 配置
      const notionValid = await validateNotion(config.notionToken, config.notionDbId);
      if (!notionValid) {
        return; // validateNotion 函数会显示具体错误信息
      }

      // 保存配置
      await chrome.storage.sync.set(config);
      showStatus('Notion 配置保存成功', 'success');
    } catch (error) {
      showStatus(`Notion 配置保存失败: ${error.message}`, 'error');
    }
  });

  // 修改状态图标控制函数
  function setInputStatus(inputElement, status) {
    // 对于select元素，使用其父元素.form-group中的.input-wrapper
    const wrapper = inputElement.tagName === 'SELECT' 
      ? inputElement.closest('.form-group').querySelector('.input-wrapper')
      : inputElement.closest('.input-wrapper');
      
    if (!wrapper) {
      console.warn('找不到状态图标容器:', inputElement);
      return;
    }

    const icon = wrapper.querySelector('.status-icon');
    if (!icon) {
      console.warn('找不到状态图标:', wrapper);
      return;
    }
    
    icon.textContent = status === 'success' ? '✓' : '✗';
    icon.className = 'status-icon ' + status;
  }

  // 修改清除状态函数
  function clearInputStatus(inputElement) {
    const wrapper = inputElement.tagName === 'SELECT'
      ? inputElement.closest('.form-group').querySelector('.input-wrapper')
      : inputElement.closest('.input-wrapper');
      
    if (!wrapper) {
      return;
    }

    const icon = wrapper.querySelector('.status-icon');
    if (!icon) {
      return;
    }
    
    icon.className = 'status-icon';
  }

  // 修改验证API的函数
  async function validateDeepSeek(apiKey) {
    try {
      const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "qwen-max",
          messages: [{
            role: "user",
            content: "test"
          }],
          max_tokens: 1
        })
      });
      
      if (response.status === 401) {
        console.error('API验证失败:', await response.json());
        setInputStatus(aiApiKey, 'error');
        return false;
      }
      setInputStatus(aiApiKey, 'success');
      return response.ok;
    } catch (error) {
      console.error('API验证异常:', error);
      setInputStatus(aiApiKey, 'error');
      return false;
    }
  }

  // 修改验证Notion的函数
  async function validateNotion(token, dbId) {
    try {
      console.log('开始验证Notion配置...');
      
      // 验证 token 格式
      if (!token.startsWith('secret_')) {
        setInputStatus(inputs.notionToken, 'error');
        throw new Error('Notion Token 格式错误，应以 "secret_" 开头');
      }

      // 验证数据库 ID 格式
      const dbIdPattern = /^[a-f0-9]{32}$/;
      const cleanDbId = dbId.replace(/-/g, '');
      if (!dbIdPattern.test(cleanDbId)) {
        setInputStatus(inputs.notionDbId, 'error');
        throw new Error('数据库 ID 格式错误');
      }

      // 验证 token
      const userResponse = await fetch('https://api.notion.com/v1/users/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28'
        }
      });

      if (!userResponse.ok) {
        const userError = await userResponse.json();
        setInputStatus(inputs.notionToken, 'error');
        throw new Error(`Notion Token 无效: ${userError.message || '验证失败'}`);
      }

      setInputStatus(inputs.notionToken, 'success');

      // 验证数据库访问权限
      const dbResponse = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28'
        }
      });

      if (!dbResponse.ok) {
        const dbError = await dbResponse.json();
        setInputStatus(inputs.notionDbId, 'error');
        throw new Error(`数据库访问失败: ${dbError.message || '无法访问数据库'}`);
      }

      setInputStatus(inputs.notionDbId, 'success');
      return true;
    } catch (error) {
      console.error('Notion验证失败:', error);
      showStatus(error.message, 'error');
      return false;
    }
  }

  // 添加输入框变化监听，清除状态
  aiApiKey.addEventListener('input', () => {
    clearInputStatus(aiApiKey);
  });

  aiApiEndpoint.addEventListener('input', () => {
    clearInputStatus(aiApiEndpoint);
  });

  aiModel.addEventListener('change', () => {
    clearInputStatus(aiModel);
  });

  function showStatus(message, type = 'info', duration = 3000) {
    statusDiv.style.display = 'block';
    statusDiv.textContent = message;
    statusDiv.className = '';
    statusDiv.classList.add(type);
    
    // 如果消息包含换行符，调整样式
    if (message.includes('\n')) {
      statusDiv.style.whiteSpace = 'pre-line';
      statusDiv.style.lineHeight = '1.5';
    } else {
      statusDiv.style.whiteSpace = 'normal';
      statusDiv.style.lineHeight = 'normal';
    }
    
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, duration);
  }

  // 验证 Token 按钮点击事件
  verifyToken.addEventListener('click', async () => {
    const token = inputs.notionToken.value.trim();
    if (!token) {
      showStatus('请输入 Notion Token', 'error');
      return;
    }

    try {
      verifyToken.disabled = true;
      verifyToken.textContent = '验证中...';
      
      const response = await fetch('https://api.notion.com/v1/users/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28'
        }
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Token 验证失败');
      }

      setInputStatus(inputs.notionToken, 'success');
      showStatus('Token 验证成功', 'success');
      refreshBtn.disabled = false;
      await refreshDatabases(); // 自动刷新数据库列表
    } catch (error) {
      console.error('Token 验证失败:', error);
      setInputStatus(inputs.notionToken, 'error');
      showStatus(`Token 验证失败: ${error.message}`, 'error');
    } finally {
      verifyToken.disabled = false;
      verifyToken.textContent = '验证';
    }
  });

  // 刷新数据库列表
  async function refreshDatabases() {
    const token = inputs.notionToken.value.trim();
    if (!token) return;

    try {
      showStatus('正在获取数据库列表...', 'info');
      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: {
            property: 'object',
            value: 'database'
          }
        })
      });

      if (!response.ok) {
        throw new Error('获取数据库列表失败');
      }

      const data = await response.json();
      const databases = data.results.map(db => ({
        id: db.id,
        title: db.title[0]?.plain_text || '未命名数据库'
      }));

      inputs.notionDbId.innerHTML = '';
      inputs.notionDbId.disabled = false;

      if (databases.length === 0) {
        inputs.notionDbId.innerHTML = '<option value="">未找到可访问的数据库</option>';
        showStatus('未找到可访问的数据库，请确保已将 Integration 添加到数据库中', 'error');
        return;
      }

      inputs.notionDbId.innerHTML = '<option value="">请选择数据库</option>';
      databases.forEach(db => {
        const option = document.createElement('option');
        option.value = db.id;
        option.textContent = db.title;
        inputs.notionDbId.appendChild(option);
      });

      showStatus('数据库列表已更新', 'success');
    } catch (error) {
      showStatus(`获取数据库列表失败: ${error.message}`, 'error');
    }
  }

  // 刷新按钮点击事件
  refreshBtn.addEventListener('click', refreshDatabases);
});
