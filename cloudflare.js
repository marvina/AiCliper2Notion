/**
 * Cloudflare图床服务 - 使用简化的 fetch 实现
 */

class CloudflareImageService {
  constructor() {
    this.config = {};
    this.init();
  }

  async init() {
    try {
      const config = await chrome.storage.sync.get([
        'cloudflareAccountId',
        's3BucketName',
        's3AccessKeyId',
        's3SecretKey',
        's3Domain'
      ]);
      this.config = config;

      // 安全日志记录
      console.log('Cloudflare 配置加载:', {
        cloudflareAccountId: this.config.cloudflareAccountId ? '已设置' : '未设置',
        s3BucketName: this.config.s3BucketName ? '已设置' : '未设置',
        s3AccessKeyId: this.config.s3AccessKeyId ? '已设置' : '未设置',
        s3SecretKey: this.config.s3SecretKey ? '已设置' : '未设置',
        s3Domain: this.config.s3Domain ? '已设置' : '未设置'
      });
    } catch (error) {
      console.error('初始化 Cloudflare 服务失败:', error);
    }
  }

  /**
   * 上传图片到Cloudflare R2
   * @param {string} imageUrl - 图片URL
   * @returns {Promise<string>} - 返回上传后的图片URL
   */
  async uploadImage(imageUrl, imageBlob = null) {
    console.log('当前 Cloudflare 配置:', {
      cloudflareAccountId: this.config.cloudflareAccountId ? '已设置' : '未设置',
      cloudflareApiToken: this.config.cloudflareApiToken ? '已设置' : '未设置',
      cloudflareImageId: this.config.cloudflareImageId ? '已设置' : '未设置'
    });

    const missingConfigs = [];
    
    if (!this.config.cloudflareAccountId) missingConfigs.push('Cloudflare Account ID');
    if (!this.config.cloudflareApiToken) missingConfigs.push('Cloudflare API Token');
    if (!this.config.cloudflareImageId) missingConfigs.push('Cloudflare Image ID');

    if (missingConfigs.length > 0) {
      console.error('缺失的配置项:', missingConfigs);
      throw new Error(`Cloudflare 配置不完整: 缺少 ${missingConfigs.join(', ')}`);
    }

    try {
      console.log(`开始上传图片: ${imageUrl}`);
      
      // 如果没有提供 blob，先获取图片数据
      let blob = imageBlob;
      if (!blob) {
        console.log('未提供图片数据，尝试获取...');
        const response = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        if (!response.ok) {
          console.error(`获取图片失败: HTTP ${response.status}`);
          throw new Error(`获取图片失败: HTTP ${response.status}`);
        }
        
        blob = await response.blob();
        console.log(`获取到图片数据: ${blob.size} 字节`);
      }
      
      // 构建表单数据
      const formData = new FormData();
      formData.append('file', blob);
      
      console.log('准备上传到 Cloudflare Images...');
      
      // 上传到 Cloudflare Images
      const uploadResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.config.cloudflareAccountId}/images/v1`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.cloudflareApiToken}`
          },
          body: formData
        }
      );
      
      const uploadResult = await uploadResponse.json();
      
      if (!uploadResponse.ok || !uploadResult.success) {
        console.error('上传到 Cloudflare 失败:', uploadResult);
        throw new Error(`上传到 Cloudflare 失败: ${uploadResult.errors?.[0]?.message || '未知错误'}`);
      }
      
      // 构建 Cloudflare 图片 URL
      const imageId = uploadResult.result.id;
      const cloudflareUrl = `https://imagedelivery.net/${this.config.cloudflareImageId}/${imageId}/public`;
      
      console.log(`上传成功: ${imageUrl} -> ${cloudflareUrl}`);
      return cloudflareUrl;
    } catch (error) {
      console.error('上传图片到 Cloudflare 失败:', error);
      throw error;
    }
  }
}

// 导出服务实例
const cloudflareService = new CloudflareImageService();
export default cloudflareService;
