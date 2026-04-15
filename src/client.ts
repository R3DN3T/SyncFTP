export default class SFTPClient {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:3000") {
    this.baseUrl = baseUrl;
    console.log(`[SFTPClient] Initialized with baseUrl: ${this.baseUrl}`);
  }

  async connect(options: any): Promise<string> {
    try {
      console.log(`[SFTPClient] Connecting to ${this.baseUrl}/connect`, options);
      const response = await fetch(`${this.baseUrl}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });

      console.log(`[SFTPClient] Connect response status:`, response.status);
      if (!response.ok) {
        throw new Error(`Connection failed: ${response.statusText}`);
      }

      return "Connected";
    } catch (error) {
      console.error(`[SFTPClient] Connect error:`, error);
      throw new Error(`Failed to connect: ${error}`);
    }
  }

  async listFiles(remoteDir: string): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: remoteDir }),
      });

      if (!response.ok) {
        throw new Error(`List failed: ${response.statusText}`);
      }

      return await response.json();
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

      const response = await fetch(`${this.baseUrl}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: remotePath, content }),
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

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
      const response = await fetch(`${this.baseUrl}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: remotePath }),
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const content = await response.text();
      await vault.adapter.write(localPath, content);
      return "";
    } catch (error) {
      throw new Error(`Failed to download: ${error}`);
    }
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/exists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });

      const data = await response.json();
      return data.exists === true;
    } catch (error) {
      return false;
    }
  }

  async makeDir(path: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/mkdir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        throw new Error(`Mkdir failed: ${response.statusText}`);
      }

      return "";
    } catch (error) {
      throw new Error(`Failed to create directory: ${error}`);
    }
  }

  async removeDir(path: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/rmdir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        throw new Error(`Rmdir failed: ${response.statusText}`);
      }

      return "";
    } catch (error) {
      throw new Error(`Failed to remove directory: ${error}`);
    }
  }

  async deleteFile(path: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.statusText}`);
      }

      return "";
    } catch (error) {
      throw new Error(`Failed to delete file: ${error}`);
    }
  }

  async disconnect(): Promise<string> {
    try {
      await fetch(`${this.baseUrl}/disconnect`, { method: "POST" });
      return "Disconnected";
    } catch (error) {
      return "Disconnected";
    }
  }
}