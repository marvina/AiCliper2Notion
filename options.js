document.addEventListener('DOMContentLoaded', () => {
// 动态加载配置文件（如果需要）
let apiConfig = {};
(async () => {
  try {
    apiConfig = await import('./config.js');
    console.log('配置文件加载成功:', apiConfig);
  } catch (error) {
    console.error('配置文件加载失败:', error);
  }
})();

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

  // Cloudflare 相关元素
  const cloudflareInputs = {
    accountId: document.getElementById('cloudflareAccountId'),
    apiToken: document.getElementById('cloudflareApiToken'),
    bucketName: document.getElementById('s3BucketName'),
    accessKeyId: document.getElementById('s3AccessKeyId'),
    secretKey: document.getElementById('s3SecretKey'),
    domain: document.getElementById('s3Domain')
  };
  const saveCloudflareConfig = document.getElementById('saveCloudflareConfig');

  // S3 相关元素
  const s3Inputs = {
    accountId: document.getElementById('s3AccountId'),
    bucketName: document.getElementById('s3BucketName'),
    accessKeyId: document.getElementById('s3AccessKeyId'),
    secretKey: document.getElementById('s3SecretKey')
  };
  const saveS3Config = document.getElementById('saveS3Config');

  // 加载已保存的配置
  chrome.storage.sync.get([
    'aiProvider', 'aiApiKey', 'aiApiEndpoint', 'aiModel',
    'notionToken', 'notionDbId',
      'cloudflareAccountId', 'cloudflareApiToken', 
      's3BucketName', 's3AccessKeyId', 's3SecretKey', 's3Domain'
  ], (config) => {
    // AI 配置
    if (config.aiProvider) {
      aiProvider.value = config.aiProvider;
      updateProviderUI(config.aiProvider);
      aiApiKey.value = config.aiApiKey || '';
      aiApiEndpoint.value = config.aiApiEndpoint || '';
      aiModel.value = config.aiModel || '';
    }

    // S3 配置
    if (config.s3AccountId) s3Inputs.accountId.value = config.s3AccountId;
    if (config.s3BucketName) s3Inputs.bucketName.value = config.s3BucketName;
    if (config.s3AccessKeyId) s3Inputs.accessKeyId.value = config.s3AccessKeyId;
    if (config.s3SecretKey) s3Inputs.secretKey.value = config.s3SecretKey;

    // Notion 配置
    if (config.notionToken) inputs.notionToken.value = config.notionToken;
    if (config.notionDbId) inputs.notionDbId.value = config.notionDbId;

    // Cloudflare 配置
    if (config.cloudflareAccountId) cloudflareInputs.accountId.value = config.cloudflareAccountId;
    if (config.cloudflareApiToken) cloudflareInputs.apiToken.value = config.cloudflareApiToken;
    if (config.s3BucketName) cloudflareInputs.bucketName.value = config.s3BucketName;
    if (config.s3AccessKeyId) cloudflareInputs.accessKeyId.value = config.s3AccessKeyId;
    if (config.s3SecretKey) cloudflareInputs.secretKey.value = config.s3SecretKey;
    if (config.s3Domain) cloudflareInputs.domain.value = config.s3Domain;
  });

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
      // 更新配置文件中的API信息
      const updatedConfig = { ...apiConfig };
      updatedConfig.account1 = {
        apiKey: config.aiApiKey,
        apiSecret: config.aiApiEndpoint
      };

      // 动态更新配置（替代写入文件）
      console.log('动态更新配置:', updatedConfig);

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
      // 更新配置文件中的Notion信息
      const updatedConfig = { ...apiConfig };
      updatedConfig.account2 = {
        apiKey: config.notionToken,
        apiSecret: config.notionDbId
      };

      // 动态更新配置（替代写入文件）
      console.log('动态更新配置:', updatedConfig);

      showStatus('Notion 配置保存成功', 'success');
    } catch (error) {
      showStatus(`Notion 配置保存失败: ${error.message}`, 'error');
    }
  });

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

  // 保存 Cloudflare 配置
  saveCloudflareConfig.addEventListener('click', async () => {
    const config = {
      cloudflareAccountId: cloudflareInputs.accountId.value.trim(),
      cloudflareApiToken: cloudflareInputs.apiToken.value.trim(),
      s3BucketName: cloudflareInputs.bucketName.value.trim(),
      s3AccessKeyId: cloudflareInputs.accessKeyId.value.trim(),
      s3SecretKey: cloudflareInputs.secretKey.value.trim(),
      s3Domain: cloudflareInputs.domain.value.trim()
    };

    if (!config.cloudflareAccountId || 
        !config.cloudflareApiToken || 
        !config.s3BucketName || 
        !config.s3AccessKeyId || 
        !config.s3SecretKey || 
        !config.s3Domain) {
      showStatus('请完整填写 Cloudflare 配置信息', 'error');
      return;
    }

    try {
      // 验证 Cloudflare 配置
      const cloudflareValid = await validateCloudflare(config);
      if (!cloudflareValid) {
        return; // validateCloudflare 函数会显示具体错误信息
      }

      // 保存配置
      await chrome.storage.sync.set(config);
      showStatus('Cloudflare 配置保存成功', 'success');
    } catch (error) {
      showStatus(`Cloudflare 配置保存失败: ${error.message}`, 'error');
    }
  });

  // 验证 Cloudflare 配置
  async function validateCloudflare(config) {
    try {
      console.log('Starting Cloudflare validation...');
      // 验证 Account ID 格式
      const accountIdPattern = /^[a-f0-9]{32}$/;
      if (!accountIdPattern.test(config.cloudflareAccountId)) {
        console.log('Account ID validation failed');
        setInputStatus(cloudflareInputs.accountId, 'error');
        showStatus('Cloudflare Account ID 格式错误，应为32位十六进制字符', 'error');
        return false;
      }
      console.log('Account ID validation passed');
      setInputStatus(cloudflareInputs.accountId, 'success');

      // 验证 API Token
      if (!config.cloudflareApiToken) {
        console.log('API Token validation failed');
        setInputStatus(cloudflareInputs.apiToken, 'error');
        showStatus('请填写 Cloudflare API Token', 'error');
        return false;
      }
      console.log('API Token validation passed');

    
    // 验证 Bucket 名称
    if (!config.s3BucketName) {
      setInputStatus(cloudflareInputs.bucketName, 'error');
      showStatus('请填写 S3 Bucket 名称', 'error');
      return false;
    }
    console.log('S3 Bucket 名称验证通过');
    setInputStatus(cloudflareInputs.bucketName, 'success');

    // 验证 Access Key ID
    if (!config.s3AccessKeyId) {
      setInputStatus(cloudflareInputs.accessKeyId, 'error');
      showStatus('请填写 S3 Access Key ID', 'error');
      return false;
    }
    console.log('S3 Access Key ID 验证通过');
    setInputStatus(cloudflareInputs.accessKeyId, 'success');

    // 验证 Secret Key
    if (!config.s3SecretKey) {
      setInputStatus(cloudflareInputs.secretKey, 'error');
      showStatus('请填写 S3 Secret Key', 'error');
      return false;
    }
    console.log('S3 Secret Key 验证通过');
    setInputStatus(cloudflareInputs.secretKey, 'success');

    // 验证 Domain 格式
    const domainPattern = /^https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!domainPattern.test(config.s3Domain)) {
      setInputStatus(cloudflareInputs.domain, 'error');
      showStatus('S3 域名格式错误，请输入有效的 URL', 'error');
      return false;
    }
    console.log('S3 域名验证通过');
    setInputStatus(cloudflareInputs.domain, 'success');

      // 验证 API 连接
      showStatus('正在验证 Cloudflare API 连接...', 'info');
      console.log('Making API request to Cloudflare...');
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/r2/buckets`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.cloudflareApiToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('API request response:', response.ok);
      console.log('API request status:', response.status);
      console.log('API request status text:', response.statusText);
      const data = await response.json();
      console.log('API response data:', data);
      
      if (!response.ok) {
        const error = data.errors?.[0]?.message || response.statusText || '验证失败';
        console.log('API request failed:', error);
        setInputStatus(cloudflareInputs.apiToken, 'error');
        showStatus(`Cloudflare API 验证失败: ${error}`, 'error');
        return false;
      }

      if (!data.success) {
        const error = data.errors?.[0]?.message || '未知错误';
        console.log('API response failed:', error);
        setInputStatus(cloudflareInputs.apiToken, 'error');
        showStatus(`Cloudflare API 验证失败: ${error}`, 'error');
        return false;
      }

      console.log('API request succeeded');
      setInputStatus(cloudflareInputs.apiToken, 'success');
      showStatus('Cloudflare API 验证成功', 'success');
      return true;
    } catch (error) {
      console.error('Cloudflare配置验证失败:', error);
      setInputStatus(cloudflareInputs.apiToken, 'error');
      showStatus(`Cloudflare 配置验证失败: ${error.message || '网络错误'}`, 'error');
      return false;
    }
  }

  // 保存 S3 配置
  saveS3Config.addEventListener('click', async () => {
    const config = {
      s3AccountId: s3Inputs.accountId.value.trim(),
      s3BucketName: s3Inputs.bucketName.value.trim(),
      s3AccessKeyId: s3Inputs.accessKeyId.value.trim(),
      s3SecretKey: s3Inputs.secretKey.value.trim()
    };

    if (!config.s3AccountId || !config.s3BucketName || !config.s3AccessKeyId || !config.s3SecretKey) {
      showStatus('请完整填写 S3 配置信息', 'error');
      return;
    }

    try {
      // 验证 S3 配置
      const s3Valid = await validateS3Config(config);
      if (!s3Valid) {
        return; // validateS3Config 函数会显示具体错误信息
      }

      // 保存配置
      await chrome.storage.sync.set(config);
      showStatus('S3 配置保存成功', 'success');
    } catch (error) {
      showStatus(`S3 配置保存失败: ${error.message}`, 'error');
    }
  });

  // 验证 S3 配置
  async function validateS3Config(config) {
    try {
      console.log('Starting S3 validation...');
      
      // 验证 Account ID 格式
      const accountIdPattern = /^[a-f0-9]{32}$/;
      if (!accountIdPattern.test(config.s3AccountId)) {
        console.log('Account ID validation failed');
        setInputStatus(s3Inputs.accountId, 'error');
        showStatus('S3 Account ID 格式错误，应为32位十六进制字符', 'error');
        return false;
      }
      console.log('Account ID validation passed');
      setInputStatus(s3Inputs.accountId, 'success');

      // 验证 Bucket 名称
      if (!config.s3BucketName) {
        setInputStatus(s3Inputs.bucketName, 'error');
        showStatus('请填写 Bucket 名称', 'error');
        return false;
      }
      console.log('Bucket 名称 validation passed');
      setInputStatus(s3Inputs.bucketName, 'success');

      // 验证 Access Key ID
      if (!config.s3AccessKeyId) {
        setInputStatus(s3Inputs.accessKeyId, 'error');
        showStatus('请填写 Access Key ID', 'error');
        return false;
      }
      console.log('Access Key ID validation passed');
      setInputStatus(s3Inputs.accessKeyId, 'success');

      // 验证 Secret Key
      if (!config.s3SecretKey) {
        setInputStatus(s3Inputs.secretKey, 'error');
        showStatus('请填写 Secret Key', 'error');
        return false;
      }
      console.log('Secret Key validation passed');
      setInputStatus(s3Inputs.secretKey, 'success');

      return true;
    } catch (error) {
      console.error('S3 validation error:', error);
      showStatus(`S3 配置验证失败: ${error.message}`, 'error');
      return false;
    }
  }

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
    'notionToken', 'notionDbId',
    'cloudflareAccountId', 'cloudflareApiToken', 'cloudflareImageId',
    's3AccountId', 's3BucketName', 's3AccessKeyId', 's3SecretKey'
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

    // Cloudflare 配置
    if (config.cloudflareAccountId) cloudflareInputs.accountId.value = config.cloudflareAccountId;
    if (config.cloudflareApiToken) cloudflareInputs.apiToken.value = config.cloudflareApiToken;
    if (config.cloudflareImageId) cloudflareInputs.imageId.value = config.cloudflareImageId;

    // S3 配置
    if (config.s3AccountId) s3Inputs.accountId.value = config.s3AccountId;
    if (config.s3BucketName) s3Inputs.bucketName.value = config.s3BucketName;
    if (config.s3AccessKeyId) s3Inputs.accessKeyId.value = config.s3AccessKeyId;
    if (config.s3SecretKey) s3Inputs.secretKey.value = config.s3SecretKey;
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

  // Notion Token 输入变化监听
  inputs.notionToken.addEventListener('input', () => {
    clearInputStatus(inputs.notionToken);
    refreshBtn.disabled = true;
  });

  // Notion 数据库选择变化监听
  inputs.notionDbId.addEventListener('change', () => {
    clearInputStatus(inputs.notionDbId);
  });

  // Cloudflare Account ID 输入变化监听
  cloudflareInputs.accountId.addEventListener('input', () => {
    clearInputStatus(cloudflareInputs.accountId);
  });

  // Cloudflare API Token 输入变化监听
  cloudflareInputs.apiToken.addEventListener('input', () => {
    clearInputStatus(cloudflareInputs.apiToken);
  });

  // Cloudflare Image ID 输入变化监听
  cloudflareInputs.imageId.addEventListener('input', () => {
    clearInputStatus(cloudflareInputs.imageId);
  });

  // S3 Account ID 输入变化监听
  s3Inputs.accountId.addEventListener('input', () => {
    clearInputStatus(s3Inputs.accountId);
  });

  // S3 Bucket Name 输入变化监听
  s3Inputs.bucketName.addEventListener('input', () => {
    clearInputStatus(s3Inputs.bucketName);
  });

  // S3 Access Key ID 输入变化监听
  s3Inputs.accessKeyId.addEventListener('input', () => {
    clearInputStatus(s3Inputs.accessKeyId);
  });

  // S3 Secret Key 输入变化监听
  s3Inputs.secretKey.addEventListener('input', () => {
    clearInputStatus(s3Inputs.secretKey);
  });

  // 如果有网站白名单或域名列表，添加小红书相关域名
  const supportedDomains = [
    // ... 现有域名 ...
    'xiaohongshu.com',
    'xhscdn.com',
    'xhs.cn'
    // ... 其他域名 ...
  ];
});
