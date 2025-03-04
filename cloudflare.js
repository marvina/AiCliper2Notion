/**
 * Cloudflare图床服务 - 使用简化的 fetch 实现
 */

class CloudflareService {
  constructor(config = {}) {
    this.config = config;
  }

  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }

  async uploadImage(imageUrl) {
    try {
      console.log('开始上传图片到 Cloudflare:', imageUrl);
      
      // 验证配置
      if (!this.config.cloudflareAccountId || 
          !this.config.cloudflareApiToken || 
          !this.config.cloudflareImageId) {
        throw new Error('缺少 Cloudflare 配置');
      }

      // 获取图片数据
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`获取图片失败: HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const formData = new FormData();
      formData.append('file', blob);

      // 使用 Cloudflare Images API 上传
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

      const result = await uploadResponse.json();
      
      if (!result.success) {
        throw new Error(result.errors?.[0]?.message || '上传失败');
      }

      // 构建图片 URL
      const imageId = result.result.id;
      const imageUrl = `https://imagedelivery.net/${this.config.cloudflareImageId}/${imageId}/public`;
      
      console.log('图片上传成功:', imageUrl);
      return imageUrl;

    } catch (error) {
      console.error('上传图片失败:', error);
      throw error;
    }
  }
}

// 导出服务实例
const cloudflareService = new CloudflareService();
export default cloudflareService;
