import { Plugin, TFolder, TFile, Notice } from 'obsidian';
import CredentialTab from './src/credential';
import SFTPClient from './src/client';

interface SyncFTPSettings {
	url: string;
	port: number;
	proxy_host: string;
	proxy_port: number;
	username: string;
	password: string;
	vault_path: string;
	notify: boolean;
	load_sync: boolean;
	server_url: string;
}

const DEFAULT_SETTINGS: SyncFTPSettings = {
	url: '',
	port: 22,
	proxy_host: '',
	proxy_port: 22,
	username: '',
	password: '',
	vault_path: '/obsidian/',
	notify: false,
	load_sync: false,
	server_url: 'http://localhost:3000'
}

export default class SyncFTP extends Plugin {
	settings: SyncFTPSettings;

	async onload() {
		await this.loadSettings();

		if (this.settings.load_sync) {
			this.downloadFile();
		}

		this.addCommand({
	      id: "push-to-sftp",
	      name: "Upload files to the SFTP",
	      callback: () => { this.uploadFile(); },
	    });

	    this.addCommand({
	      id: "pull-from-sftp",
	      name: "Download files from the SFTP",
	      callback: () => { this.downloadFile(); },
	    });

		const syncUpload = this.addRibbonIcon(
			'arrow-up',
			'Upload to FTP',
			() => { this.uploadFile(); });

		const syncDownload = this.addRibbonIcon(
			'arrow-down',
			'Download from FTP',
			() => { this.downloadFile(); });

		this.addSettingTab(new CredentialTab(this.app, this));
	}

	async onunload() {
		await this.saveSettings();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private generateSessionId(): string {
		return new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
	}

	async uploadFile() {
		if (this.settings.url !== '') {
			const client = new SFTPClient(this.settings.server_url);
			new Notice(`Connecting to SFTP for file sync:\n${this.settings.url}:${this.settings.port}\n${this.settings.username}`);
			try {
				let conn = await client.connect({
					proxy_host: this.settings.proxy_host,
					proxy_port: Number(this.settings.proxy_port),
					host: this.settings.url,
					port: Number(this.settings.port),
					username: this.settings.username,
					password: this.settings.password
				});

				if (this.settings.notify) new Notice(conn);

				if (await client.fileExists(this.settings.vault_path) === false) {
					await client.makeDir(this.settings.vault_path);
				}

				if (await client.fileExists(`${this.settings.vault_path}${this.app.vault.getName()}/`) === false) {
					await client.makeDir(`${this.settings.vault_path}${this.app.vault.getName()}/`);
				}

				// Generate session ID for this upload
				const sessionId = this.generateSessionId();
				console.log(`[UPLOAD] Session ID: ${sessionId}`);

				let rem_path = this.settings.vault_path + this.app.vault.getName();
				
				// Get ALL local files - no filtering, upload everything
				let loc_list = this.app.vault.getAllLoadedFiles();
				loc_list.splice(0, 1); // Remove root

				console.log(`[UPLOAD] Uploading ${loc_list.length} files/folders`);

				// Upload all files and create all directories
				for (const loc_file of loc_list) {
					let sync = '';
					try {
						if (loc_file instanceof TFolder) {
							sync = await client.makeDir(`${rem_path}/${loc_file.path}`);
							console.log(`[UPLOAD] Created folder: ${loc_file.path}`);
						} else if (loc_file instanceof TFile) {
							sync = await client.uploadFile(loc_file.path, `${rem_path}/${loc_file.path}`, this.app.vault, sessionId);
							console.log(`[UPLOAD] Uploaded file: ${loc_file.path}`);
						}

						if (this.settings.notify && sync.trim() != '') new Notice(sync);
					} catch (err) {
						console.error(`Error uploading ${loc_file.name}: ${err}`);
						if (this.settings.notify) new Notice(`Error uploading ${loc_file.name}: ${err}`);
					}
				}

				let disconn = await client.disconnect();

				if (this.settings.notify) new Notice(disconn);
				else new Notice('Done!');
			} catch (err) {
				new Notice(`Failed to connect to SFTP: ${err}`);
			}
		}
	}

	async downloadFile() {
		if (this.settings.url !== '') {
			const client = new SFTPClient(this.settings.server_url);
			new Notice(`Connecting to SFTP for file sync:\n${this.settings.url}:${this.settings.port}\n${this.settings.username}`);
			try {
				let conn = await client.connect({
					proxy_host: this.settings.proxy_host,
					proxy_port: Number(this.settings.proxy_port),
					host: this.settings.url,
					port: Number(this.settings.port),
					username: this.settings.username,
					password: this.settings.password
				});

				if (this.settings.notify) new Notice(conn);

				const vaultName = this.app.vault.getName();
				const vaultPath = this.settings.vault_path + vaultName;

				if (! await client.fileExists(vaultPath)) {
					new Notice(`Vault "${vaultName}" does not exist at ${vaultPath}. Please upload first or check vault name.`);
				} else {
					let rem_path = this.settings.vault_path + this.app.vault.getName();
					let rem_list = await client.listFiles(rem_path);

					console.log(`[DOWNLOAD] Found ${rem_list.length} items in latest version`);

					// Get local files list
					let loc_list = this.app.vault.getAllLoadedFiles();
					loc_list.splice(0, 1); // Remove root

					console.log(`[DOWNLOAD] Found ${loc_list.length} local items`);

					// First pass: Delete local files/folders that don't exist in remote
					for (const loc_file of loc_list) {
						// Check if this file exists in remote
						const existsInRemote = rem_list.some(rem_file => {
							const rem_relative = rem_file.path.replace(rem_path, '');
							const loc_relative = `/${loc_file.path}`;
							return `${rem_relative}/${rem_file.name}` === loc_relative || 
								   `${rem_relative}/${rem_file.name}/` === `${loc_relative}/`;
						});

						if (!existsInRemote) {
							try {
								console.log(`[DOWNLOAD] Deleting local file (not in server): ${loc_file.path}`);
								await this.app.vault.trash(loc_file, false);
								if (this.settings.notify) new Notice(`Deleted: ${loc_file.name}`);
							} catch (err) {
								console.error(`Error deleting ${loc_file.path}: ${err}`);
								if (this.settings.notify) new Notice(`Error deleting ${loc_file.name}: ${err}`);
							}
						}
					}

					// Second pass: Download all files from remote
					for (const rem_file of rem_list) {
						let sync = '';
						let dst_path = (rem_file.path !== rem_path) ? `${rem_file.path.replace(rem_path,'')}/`: '';

						try {
							if (rem_file.type === 'd') {
								// Create directory
								try {
									await this.app.vault.createFolder(`${dst_path}${rem_file.name}/`);
									sync = `Created directory: ${rem_file.name}`;
									console.log(`[DOWNLOAD] Created folder: ${dst_path}${rem_file.name}`);
								} catch (e) {
									// Directory might already exist
									console.log(`[DOWNLOAD] Folder already exists: ${dst_path}${rem_file.name}`);
								}
							} else {
								// Download file
								sync = await client.downloadFile(`${rem_file.path}/${rem_file.name}`, `${dst_path}${rem_file.name}`, this.app.vault);
								console.log(`[DOWNLOAD] Downloaded file: ${dst_path}${rem_file.name}`);
							}

							if (this.settings.notify && sync.trim() != '') new Notice(sync);
						} catch (err) {
							console.error(`Error downloading ${rem_file.name}: ${err}`);
							if (this.settings.notify) new Notice(`Error downloading ${rem_file.name}: ${err}`);
						}
					}
				}

				let disconn = await client.disconnect();

				if (this.settings.notify) new Notice(disconn);
				else new Notice('Done!');
			} catch (err) {
				new Notice(`Failed to connect to SFTP: ${err}`);
			}
		}
	}
}