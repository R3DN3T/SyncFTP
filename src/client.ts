import { Client, ConnectConfig } from "ssh2";

interface ExtendedConnectConfig extends ConnectConfig {
  proxy_host?: string;
  proxy_port?: number;
}

export default class SFTPClient {
  private conn: Client;

  constructor() {
    this.conn = new Client();
  }

  private connectSSH(options: ExtendedConnectConfig): Promise<any> {
    return new Promise((resolve, reject) => {
      this.conn
        .on("ready" as any, resolve)
        .on("error", reject)
        .connect({
          host: options.host,
          port: options.port,
          username: options.username,
          password: options.password,
        });
    });
  }

  async connect(options: ExtendedConnectConfig) {
    await this.connectSSH(options);
    return "Connected";
  }

  async listFiles(remoteDir: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) return reject(err);

        sftp.readdir(remoteDir, (err, list) => {
          if (err) return reject(err);

          const out = list.map(f => ({
            name: f.filename,
            size: f.attrs.size,
            mtime: f.attrs.mtime * 1000,
            type: f.longname.startsWith("d") ? "d" : "f",
            path: remoteDir
          }));

          resolve(out);
        });
      });
    });
  }

  async uploadFile(localPath: string, remotePath: string, vault: any): Promise<string> {
    const content = await vault.adapter.read(localPath);

    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) return reject(err);

        const writeStream = sftp.createWriteStream(remotePath);

        writeStream.on("close", () => resolve(""));
        writeStream.on("error", reject);

        writeStream.end(content);
      });
    });
  }

  async downloadFile(remotePath: string, localPath: string, vault: any): Promise<string> {
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) return reject(err);

        let data = "";

        const stream = sftp.createReadStream(remotePath);

        stream.on("data", (chunk: any) => data += chunk);
        stream.on("end", async () => {
          await vault.adapter.write(localPath, data);
          resolve("");
        });
        stream.on("error", reject);
      });
    });
  }

  async fileExists(path: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) return reject(err);
        sftp.stat(path, (err) => {
          resolve(!err);
        });
      });
    });
  }

  async makeDir(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) return reject(err);
        sftp.mkdir(path, (err) => {
          if (err) return reject(err);
          resolve("");
        });
      });
    });
  }

  async removeDir(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) return reject(err);
        sftp.rmdir(path, (err) => {
          if (err) return reject(err);
          resolve("");
        });
      });
    });
  }

  async deleteFile(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) return reject(err);
        sftp.unlink(path, (err) => {
          if (err) return reject(err);
          resolve("");
        });
      });
    });
  }

  async disconnect() {
    this.conn.end();
    return "Disconnected";
  }
}