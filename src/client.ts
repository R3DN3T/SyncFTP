export default class SFTPClient {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:3000") {
    this.baseUrl = baseUrl;
    console.log(`[SFTPClient] Initialized with baseUrl: ${this.baseUrl}`);
  }

  private async request(endpoint: string, method: string, data?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${this.baseUrl}${endpoint}`;
      
      console.log(`[SFTPClient] ${method} ${url}`, data);

      xhr.open(method, url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.onload = () => {
        console.log(`[SFTPClient] Response ${xhr.status}:`, xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = xhr.responseText ? JSON.parse(xhr.responseText) : {};
            resolve(response);
          } catch (e) {
            resolve(xhr.responseText);
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`));
        }
      };

      xhr.onerror = () => {
        console.error(`[SFTPClient] XHR Error:`, xhr.status, xhr.statusText);
        reject(new Error(`Failed to ${method} ${endpoint}: ${xhr.statusText}`));
      };

      xhr.ontimeout = () => {
        console.error(`[SFTPClient] XHR Timeout`);
        reject(new Error(`Request timeout`));
      };

      xhr.timeout = 30000;

      if (data) {
        xhr.send(JSON.stringify(data));
      } else {
        xhr.send();
      }
    });
  }

  async connect(options: any): Promise<string> {
    try {
      console.log(`[SFTPClient] Connecting...`, options);
      await this.request('/connect', 'POST', options);
      return "Connected";
    } catch (error) {
      console.error(`[SFTPClient] Connect error:`, error);
      throw new Error(`Failed to connect: ${error}`);
    }
  }

  async listFiles(remoteDir: string): Promise<any[]> {
    try {
      const response = await this.request('/list', 'POST', { path: remoteDir });
      return Array.isArray(response) ? response : [];
    } catch (error) {
      throw new Error(`Failed to list files: ${error}`);
    }
  }

  async uploadFile(
    localPath: string,
    remotePath: string,
    vault: any
  ): Promise<string> {
    try {
      const content = await vault.adapter.read(localPath);
      await this.request('/upload', 'POST', { path: remotePath, content });
      return "";
    } catch (error) {
      throw new Error(`Failed to upload: ${error}`);
    }
  }

  async downloadFile(
    remotePath: string,
    localPath: string,
    vault: any
  ): Promise<string> {
    try {
      const response = await this.request('/download', 'POST', { path: remotePath });
      const content = typeof response === 'string' ? response : JSON.stringify(response);
      await vault.adapter.write(localPath, content);
      return "";
    } catch (error) {
      throw new Error(`Failed to download: ${error}`);
    }
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const response = await this.request('/exists', 'POST', { path });
      return response.exists === true;
    } catch (error) {
      return false;
    }
  }

  async makeDir(path: string): Promise<string> {
    try {
      await this.request('/mkdir', 'POST', { path });
      return "";
    } catch (error) {
      throw new Error(`Failed to create directory: ${error}`);
    }
  }

  async removeDir(path: string): Promise<string> {
    try {
      await this.request('/rmdir', 'POST', { path });
      return "";
    } catch (error) {
      throw new Error(`Failed to remove directory: ${error}`);
    }
  }

  async deleteFile(path: string): Promise<string> {
    try {
      await this.request('/delete', 'POST', { path });
      return "";
    } catch (error) {
      throw new Error(`Failed to delete file: ${error}`);
    }
  }

  async disconnect(): Promise<string> {
    try {
      await this.request('/disconnect', 'POST');
      return "Disconnected";
    } catch (error) {
      return "Disconnected";
    }
  }
}