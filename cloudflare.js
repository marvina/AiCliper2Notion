/**
 * Cloudflare R2 图床服务
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
        'r2DevUrl'
      ]);
      this.config = config;

      // 安全日志记录
      console.log('Cloudflare 配置加载:', {
        cloudflareAccountId: this.config.cloudflareAccountId ? '已设置' : '未设置',
        s3BucketName: this.config.s3BucketName ? '已设置' : '未设置',
        s3AccessKeyId: this.config.s3AccessKeyId ? '已设置' : '未设置',
        r2DevUrl: this.config.r2DevUrl? '已设置' : '未设置'
      });
    } catch (error) {
      console.error('初始化 Cloudflare 服务失败:', error);
    }
  }

  /**
   * 上传图片到 Cloudflare R2
   * @param {string} imageUrl - 图片URL
   * @returns {Promise<string>} - 返回上传后的图片URL
   */
  async uploadImage(imageUrl) {
    try {
      // 1. 配置检查
      const missingConfigs = [];
      if (!this.config.cloudflareAccountId) missingConfigs.push('Cloudflare Account ID');
      if (!this.config.s3BucketName) missingConfigs.push('S3 Bucket Name');
      if (!this.config.s3AccessKeyId) missingConfigs.push('S3 Access Key ID');
      if (!this.config.s3SecretKey) missingConfigs.push('S3 Secret Key');

      if (missingConfigs.length > 0) {
        throw new Error(`请先完成以下配置: ${missingConfigs.join(', ')}`);
      }

      // 2. 获取图片
      console.log('获取图片:', imageUrl);
      const isXiaohongshu = imageUrl.includes('xiaohongshu.com');
      
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': isXiaohongshu ? 'https://www.xiaohongshu.com/' : imageUrl,
        'Origin': isXiaohongshu ? 'https://www.xiaohongshu.com' : null,
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': isXiaohongshu ? 'same-site' : 'cross-site'
      };

      let blob;
      if (isXiaohongshu) {
        const result = await chrome.runtime.sendMessage({
          action: 'fetchImage',
          url: imageUrl,
          headers: headers
        });
        if (!result?.success) {
          throw new Error(result?.error || '获取图片失败');
        }
        blob = result.blob;
      } else {
        const response = await fetch(imageUrl, { headers });
        if (!response.ok) {
          throw new Error(`获取图片失败: ${response.status}`);
        }
        blob = await response.blob();
      }

      // 3. 准备上传
      const extension = this.getExtensionFromMimeType(blob.type);
      const objectName = `image-${Date.now()}.${extension}`;
      const endpoint = `https://${this.config.cloudflareAccountId}.r2.cloudflarestorage.com`;
      
      // 4. 计算签名和上传
      const { authorization, date, contentSha256 } = await this.generateSignature(
        'PUT',
        objectName,
        blob
      );

      // 5. 上传图片
      const uploadUrl = `${endpoint}/${this.config.s3BucketName}/${objectName}`;
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': authorization,
          'Content-Type': blob.type,
          'x-amz-date': date,
          'x-amz-content-sha256': contentSha256
        },
        body: blob
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`上传失败: ${uploadResponse.status} - ${errorText}`);
      }

      // 6. 构建并返回 Cloudflare URL
      // 使用 R2 公共 URL 构建图片访问地址
      let publicUrl;
      if (this.config.r2DevUrl) {
        // 确保 r2DevUrl是完整的 URL
        const baseUrl = this.config.r2DevUrl.startsWith('http') 
          ? this.config.r2DevUrl
          : `https://${this.config.r2DevUrl}`;
        
        // 移除末尾的斜杠（如果有）
        const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
        publicUrl = `${cleanBaseUrl}/${objectName}`;
      } else {
        // 如果没有配置 r2DevUrl，抛出错误
        throw new Error('请先配置 R2 存储桶公共访问 URL');
      }

      console.log('生成的 R2 公共访问 URL:', publicUrl);
      return publicUrl;
    } catch (error) {
      console.error('上传图片失败:', error);
      throw error;
    }
  }

  // 工具方法
  getExtensionFromMimeType(mimeType) {
    const map = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp'
    };
    return map[mimeType] || 'jpg';
  }

  // AWS 签名生成
  async generateSignature(method, objectName, blob) {
    try {
      // 获取当前时间用于签名
      const date = new Date();
      const amzDate = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');
      const dateStamp = date.toISOString().split('T')[0].replace(/-/g, '');
      
      // 计算内容哈希
      const arrayBuffer = await blob.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const contentSha256 = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      
      // 准备签名参数
      const region = 'auto';
      const service = 's3';
      const hostHeader = `${this.config.cloudflareAccountId}.r2.cloudflarestorage.com`;
      
      // 构建规范请求
      const canonicalUri = `/${this.config.s3BucketName}/${objectName}`;
      const canonicalQueryString = '';
      const canonicalHeaders = [
        `content-type:${blob.type}`,
        `host:${hostHeader}`,
        `x-amz-content-sha256:${contentSha256}`,
        `x-amz-date:${amzDate}`
      ].join('\n') + '\n';
      
      const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
      const canonicalRequest = [
        method,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        contentSha256
      ].join('\n');
      
      // 计算规范请求的哈希
      const encoder = new TextEncoder();
      const canonicalRequestBuffer = await crypto.subtle.digest(
        'SHA-256', 
        encoder.encode(canonicalRequest)
      );
      const canonicalRequestHash = Array.from(new Uint8Array(canonicalRequestBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      
      // 构建签名字符串
      const algorithm = 'AWS4-HMAC-SHA256';
      const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
      const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        canonicalRequestHash
      ].join('\n');
      
      // 计算签名密钥
      const kSecret = encoder.encode(`AWS4${this.config.s3SecretKey}`);
      
      // 生成签名密钥
      const kDate = await this.hmacSHA256(kSecret, dateStamp);
      const kRegion = await this.hmacSHA256(kDate, region);
      const kService = await this.hmacSHA256(kRegion, service);
      const kSigning = await this.hmacSHA256(kService, 'aws4_request');
      
      // 计算最终签名
      const signatureBuffer = await this.hmacSHA256(kSigning, stringToSign);
      const signature = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      
      // 构建授权头
      const authorization = [
        `${algorithm} Credential=${this.config.s3AccessKeyId}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`
      ].join(', ');
      
      return {
        authorization,
        date: amzDate,
        contentSha256
      };
    } catch (error) {
      console.error('生成签名失败:', error);
      throw error;
    }
  }

  // HMAC-SHA256 辅助函数
  async hmacSHA256(key, message) {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key instanceof ArrayBuffer ? key : key.buffer,
      { name: 'HMAC', hash: { name: 'SHA-256' } },
      false,
      ['sign']
    );
    
    return crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      typeof message === 'string' ? new TextEncoder().encode(message) : message
    );
  }
}

const cloudflareService = new CloudflareImageService();
export default cloudflareService;
