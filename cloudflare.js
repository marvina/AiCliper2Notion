/**
 * Cloudflare图床服务
 */

class CloudflareImageService {
  constructor() {
    this.config = {};
    this.init();
  }

  async init() {
    const config = await chrome.storage.sync.get([
      'cloudflareAccountId',
      'cloudflareApiToken',
      's3BucketName',
      's3AccessKeyId',
      's3SecretKey',
      's3Domain'
    ]);
    this.config = config;

    // 安全日志记录
    console.log('Cloudflare 配置加载:', {
      cloudflareAccountId: this.config.cloudflareAccountId ? '已设置' : '未设置',
      cloudflareApiToken: this.config.cloudflareApiToken ? '已设置' : '未设置',
      s3BucketName: this.config.s3BucketName ? '已设置' : '未设置',
      s3AccessKeyId: this.config.s3AccessKeyId ? '已设置' : '未设置',
      s3Domain: this.config.s3Domain ? '已设置' : '未设置'
    });
  }

  /**
   * 上传图片到Cloudflare R2
   * @param {string} imageUrl - 图片URL
   * @returns {Promise<string>} - 返回上传后的图片URL
   */
  async uploadImage(imageUrl) {
    console.log('当前 Cloudflare 配置:', {
      cloudflareAccountId: this.config.cloudflareAccountId ? '已设置' : '未设置',
      cloudflareApiToken: this.config.cloudflareApiToken ? '已设置' : '未设置',
      cloudflareImageId: this.config.cloudflareImageId || '未设置'
    });

    if (!this.config.cloudflareAccountId || 
        !this.config.cloudflareApiToken || 
        !this.config.s3BucketName || 
        !this.config.s3AccessKeyId || 
        !this.config.s3SecretKey || 
        !this.config.s3Domain) {
      throw new Error('请先完成Cloudflare的所有配置');
    }

    try {
      console.log('Fetching image:', imageUrl);
      // 先获取图片数据
      const response = await fetch(imageUrl);
      console.log('Image fetched:', response.ok);
      const blob = await response.blob();

      // 准备上传到Cloudflare R2
      const bucketName = this.config.s3BucketName;
      const objectName = 'image-' + Date.now(); // Generate a unique object name

      const uploadUrl = `https://${this.config.s3Domain}/${objectName}`;

      console.log('Uploading to Cloudflare R2...');
      const date = new Date();
      const amzDate = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');
      const dateStamp = date.toISOString().split('T')[0].replace(/-/g, '');

      const method = 'PUT';
      const service = 's3';
      const region = 'auto';
      const host = `${bucketName}.${this.config.cloudflareAccountId}.r2.cloudflarestorage.com`;
      const contentType = blob.type;
      const contentSha256 = await this.hashBlob(blob);
      const canonicalUri = `/${objectName}`;
      const canonicalQueryString = '';
      const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${contentSha256}\nx-amz-date:${amzDate}\n`;
      const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
      const payloadHash = contentSha256;

      const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

      const algorithm = 'AWS4-HMAC-SHA256';
      const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
      const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await this.hashString(canonicalRequest)}`;

      const signingKey = await this.getSignatureKey(this.config.cloudflareApiToken, dateStamp, region, service);
      const signature = await this.hmac(signingKey, stringToSign);

      const authorizationHeader = `${algorithm} Credential=${this.config.cloudflareApiToken}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${this.hexEncode(signature)}`;

      const headers = {
        'Authorization': authorizationHeader,
        'Content-Type': contentType,
        'Host': this.config.s3Domain.replace('https://', ''),
        'x-amz-content-sha256': contentSha256,
        'x-amz-date': amzDate
      };

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: headers,
        body: blob
      });

      console.log('Upload response:', uploadResponse.ok);
      console.log('Upload response status:', uploadResponse.status);
      console.log('Upload response status text:', uploadResponse.statusText);

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.log('Upload response error:', errorText);
        throw new Error(`上传失败: ${errorText}`);
      }

      const result = await uploadResponse.json();
      console.log('Upload result:', result);

      return uploadUrl; // Return the URL of the uploaded image
    } catch (error) {
      console.error('上传图片到Cloudflare R2失败:', error);
      throw error;
    }
  }

  async hashBlob(blob) {
    const msgUint8 = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  async hashString(string) {
    const msgUint8 = new TextEncoder().encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  async hmac(key, string) {
    const msgUint8 = new TextEncoder().encode(string);
    // 检查 key 是否已经是 CryptoKey 类型
    if (key instanceof CryptoKey) {
      const hashBuffer = await crypto.subtle.sign('HMAC', key, msgUint8);
      return hashBuffer;
    } else {
      // 如果不是 CryptoKey，先转换为 CryptoKey
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const hashBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgUint8);
      return hashBuffer;
    }
  }

  async getSignatureKey(key, dateStamp, regionName, serviceName) {
    const encoder = new TextEncoder();

    // Import the initial key
    let kDate = await crypto.subtle.importKey(
      'raw',
      encoder.encode(`AWS4${key}`),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Generate the regional key
    const kDateBuffer = await this.hmac(kDate, dateStamp);
    const kRegion = await crypto.subtle.importKey(
      'raw',
      kDateBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Generate the service key
    const kRegionBuffer = await this.hmac(kRegion, regionName);
    const kService = await crypto.subtle.importKey(
      'raw',
      kRegionBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Generate the signing key
    const kServiceBuffer = await this.hmac(kService, serviceName);
    const kSigning = await crypto.subtle.importKey(
      'raw',
      kServiceBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Generate the final signing key
    const kSigningBuffer = await this.hmac(kSigning, 'aws4_request');

    return kSigningBuffer;
  }

  hexEncode(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }
}

// 导出服务实例
const cloudflareService = new CloudflareImageService();
export default cloudflareService;
