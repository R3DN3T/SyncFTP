export default class SFTPClient {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:3000") {
    this.baseUrl = baseUrl;
  }

  private async request(endpoint: string, method: string, data?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: data ? JSON.stringify(data) : undefined,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } catch (error) {
      throw error;
    }
  }

  async connect(options: any): Promise<string> {
    try {
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
      const files = Array.isArray(response) ? response : [];
      return files.map(file => ({
        ...file,
        path: remoteDir
      }));
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
      console.log(`[SFTPClient] fileExists() checking: "${path}"`);
      const response = await this.request('/exists', 'POST', { path });
      console.log(`[SFTPClient] fileExists() response:`, response);
      const exists = response.exists === true;
      console.log(`[SFTPClient] fileExists() result: ${exists}`);
      return exists;
    } catch (error) {
      console.error(`[SFTPClient] fileExists() error:`, error);
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