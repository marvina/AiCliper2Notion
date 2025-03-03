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
  async uploadImage(imageUrl) {
    console.log('当前 Cloudflare 配置:', {
      cloudflareAccountId: this.config.cloudflareAccountId ? '已设置' : '未设置',
      s3BucketName: this.config.s3BucketName ? '已设置' : '未设置',
      s3AccessKeyId: this.config.s3AccessKeyId ? '已设置' : '未设置',
      s3Domain: this.config.s3Domain ? '已设置' : '未设置'
    });

    const missingConfigs = [];
    
    if (!this.config.cloudflareAccountId) missingConfigs.push('Cloudflare Account ID');
    if (!this.config.s3BucketName) missingConfigs.push('S3 Bucket Name');
    if (!this.config.s3AccessKeyId) missingConfigs.push('S3 Access Key ID');
    if (!this.config.s3SecretKey) missingConfigs.push('S3 Secret Key');

    if (missingConfigs.length > 0) {
      console.error('缺失的配置项:', missingConfigs);
      throw new Error(`请先完成以下配置: ${missingConfigs.join(', ')}`);
    }

    try {
      console.log('获取图片:', imageUrl);
      
      // 使用通用的请求头
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      };
      
      // 获取图片
      const response = await fetch(imageUrl, { 
        method: 'GET',
        headers: headers,
        mode: 'cors',
        credentials: 'omit'
      });
      
      if (!response.ok) {
        throw new Error(`获取图片失败: ${response.status} ${response.statusText}`);
      }
      
      const blob = await response.blob();
      
      console.log('图片获取成功，类型:', blob.type);
      
      // 生成带扩展名的对象名
      const getExtensionFromMimeType = (mimeType) => {
        const map = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/gif': 'gif',
          'image/webp': 'webp'
        };
        return map[mimeType] || 'jpg';
      };
      
      const extension = getExtensionFromMimeType(blob.type);
      const objectName = `image-${Date.now()}.${extension}`;
      
      // 使用正确的 R2 端点格式
      const endpoint = `https://${this.config.cloudflareAccountId}.r2.cloudflarestorage.com`;
      const hostHeader = new URL(endpoint).host;
      
      console.log('使用 R2 端点:', endpoint);
      console.log('使用 Host 头:', hostHeader);
      
      // 构建上传 URL
      const uploadUrl = `${endpoint}/${this.config.s3BucketName}/${objectName}`;
      console.log('上传 URL:', uploadUrl);
      
      // 获取当前时间用于签名
      const date = new Date();
      const amzDate = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');
      const dateStamp = date.toISOString().split('T')[0].replace(/-/g, '');
      
      // 计算内容哈希
      const arrayBuffer = await blob.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const contentSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // 准备签名
      const method = 'PUT';
      const region = 'auto';
      const service = 's3';
      
      // 构建规范请求
      const canonicalUri = `/${this.config.s3BucketName}/${objectName}`;
      const canonicalQueryString = '';
      const canonicalHeaders = `content-type:${blob.type}\nhost:${hostHeader}\nx-amz-content-sha256:${contentSha256}\nx-amz-date:${amzDate}\n`;
      const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
      
      const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${contentSha256}`;
      
      console.log('规范请求:', canonicalRequest);
      
      // 计算规范请求的哈希
      const encoder = new TextEncoder();
      const canonicalRequestBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest));
      const canonicalRequestHash = Array.from(new Uint8Array(canonicalRequestBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      
      // 构建签名字符串
      const algorithm = 'AWS4-HMAC-SHA256';
      const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
      const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
      
      console.log('签名字符串:', stringToSign);
      
      // 计算签名密钥
      const kSecret = encoder.encode(`AWS4${this.config.s3SecretKey}`);
      
      // 第一步：生成日期密钥
      const kDateKey = await crypto.subtle.importKey(
        'raw', 
        kSecret, 
        { name: 'HMAC', hash: { name: 'SHA-256' } }, 
        false, 
        ['sign']
      );
      const kDate = await crypto.subtle.sign(
        'HMAC', 
        kDateKey, 
        encoder.encode(dateStamp)
      );
      
      // 第二步：生成区域密钥
      const kRegionKey = await crypto.subtle.importKey(
        'raw', 
        kDate, 
        { name: 'HMAC', hash: { name: 'SHA-256' } }, 
        false, 
        ['sign']
      );
      const kRegion = await crypto.subtle.sign(
        'HMAC', 
        kRegionKey, 
        encoder.encode(region)
      );
      
      // 第三步：生成服务密钥
      const kServiceKey = await crypto.subtle.importKey(
        'raw', 
        kRegion, 
        { name: 'HMAC', hash: { name: 'SHA-256' } }, 
        false, 
        ['sign']
      );
      const kService = await crypto.subtle.sign(
        'HMAC', 
        kServiceKey, 
        encoder.encode(service)
      );
      
      // 第四步：生成签名密钥
      const kSigningKey = await crypto.subtle.importKey(
        'raw', 
        kService, 
        { name: 'HMAC', hash: { name: 'SHA-256' } }, 
        false, 
        ['sign']
      );
      const kSigning = await crypto.subtle.sign(
        'HMAC', 
        kSigningKey, 
        encoder.encode('aws4_request')
      );
      
      // 计算最终签名
      const signatureKey = await crypto.subtle.importKey(
        'raw', 
        kSigning, 
        { name: 'HMAC', hash: { name: 'SHA-256' } }, 
        false, 
        ['sign']
      );
      const signature = await crypto.subtle.sign(
        'HMAC', 
        signatureKey, 
        encoder.encode(stringToSign)
      );
      
      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      
      // 构建授权头
      const authorizationHeader = `${algorithm} Credential=${this.config.s3AccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;
      
      console.log('授权头:', authorizationHeader.substring(0, 50) + '...');
      
      // 发送上传请求
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': authorizationHeader,
          'Content-Type': blob.type,
          'Host': hostHeader,
          'x-amz-content-sha256': contentSha256,
          'x-amz-date': amzDate
        },
        body: blob
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('上传失败详情:', {
          status: uploadResponse.status,
          statusText: uploadResponse.statusText,
          headers: Object.fromEntries([...uploadResponse.headers.entries()]),
          body: errorText
        });
        throw new Error(`上传失败: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
      }
      
      console.log('上传成功!');
      
      // 构建公共访问 URL - 修改这部分
      // 不要使用R2的直接URL，而是使用您配置的自定义域名
      const publicUrl = this.config.s3Domain ? 
        `${this.config.s3Domain}/${objectName}` : 
        `${endpoint}/${this.config.s3BucketName}/${objectName}`;
      
      return publicUrl;
    } catch (error) {
      console.error('上传图片到 R2 失败:', error);
      throw error;
    }
  }
}

// 导出服务实例
const cloudflareService = new CloudflareImageService();
export default cloudflareService;
