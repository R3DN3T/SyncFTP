# Servidor SFTP HTTP para Obsidian

Este es un servidor Node.js que debe correr en la RPi. Expone endpoints HTTP que el plugin de Obsidian (PC y Mobile) usa para acceder al SFTP.

## Instalación en la RPi

1. **Instala Node.js en la RPi:**
```bash
sudo apt install nodejs npm
```

2. **Crea una carpeta para el servidor:**
```bash
mkdir ~/obsidian-sftp-server
cd ~/obsidian-sftp-server
```

3. **Inicializa el proyecto:**
```bash
npm init -y
npm install express cors body-parser ssh2-sftp-client
```

4. **Crea un archivo `server.js`:**
```javascript
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const SftpClient = require('ssh2-sftp-client');

const app = express();

// CORS Configuration for Obsidian (PC & Mobile)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 86400
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Log de todas las solicitudes
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Error handling middleware (debe ir antes de las rutas)
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

let sftpClient = null;
let currentConfig = null;

// Helper: Generate ISO timestamp for versioning
function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
}

// Helper: Get the latest version directory for a vault
async function getLatestVersionPath(basePath) {
  try {
    const list = await sftpClient.list(basePath);
    // Filter only directories (type 'd') and sort by name (which is a timestamp)
    const dirs = list.filter(item => item.type === 'd').sort((a, b) => b.name.localeCompare(a.name));
    if (dirs.length > 0) {
      return `${basePath}/${dirs[0].name}`;
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Conectar al servidor SFTP
app.post('/connect', async (req, res) => {
  try {
    console.log('[CONNECT] Request received');
    console.log('[CONNECT] Request body:', req.body);
    
    // Validar que tenemos los datos necesarios
    if (!req.body.host || !req.body.username || !req.body.password) {
      console.error('[CONNECT] Missing required fields');
      return res.status(400).json({ error: 'Missing host, username, or password' });
    }
    
    // Cerrar conexión anterior si existe
    if (sftpClient) {
      try {
        console.log('[CONNECT] Closing previous connection...');
        await sftpClient.end();
      } catch (e) {
        console.log('[CONNECT] Previous connection was already closed');
      }
      sftpClient = null;
    }
    
    const config = {
      host: req.body.host,
      port: req.body.port || 22,
      username: req.body.username,
      password: req.body.password,
      readyTimeout: 30000,
    };

    console.log('[CONNECT] Creating SFTP client...');
    sftpClient = new SftpClient();
    
    console.log('[CONNECT] Attempting to connect...');
    await sftpClient.connect(config);
    currentConfig = config;

    console.log('[CONNECT] Connection successful');
    res.json({ message: 'Connected', success: true });
  } catch (error) {
    console.error('[CONNECT] Connection failed:', error.message);
    console.error('[CONNECT] Error details:', error);
    sftpClient = null;
    res.status(500).json({ 
      error: `Connection failed: ${error.message}`,
      success: false 
    });
  }
});

// Listar archivos (de la versión más reciente)
app.post('/list', async (req, res) => {
  try {
    if (!sftpClient) {
      return res.status(400).json({ error: 'Not connected' });
    }

    const requestPath = req.body.path;
    console.log(`[LIST] Original path: ${requestPath}`);
    
    const pathParts = requestPath.split('/').filter(p => p);
    let vaultBase = '';
    let vaultName = '';
    
    const obsidianIndex = pathParts.indexOf('obsidian');
    if (obsidianIndex !== -1 && obsidianIndex + 1 < pathParts.length) {
      // Reconstruct the path up to and including vault name
      vaultBase = '/' + pathParts.slice(0, obsidianIndex + 2).join('/');
      vaultName = pathParts[obsidianIndex + 1];
    } else {
      vaultName = pathParts[0];
      vaultBase = '/' + vaultName;
    }
    
    console.log(`[LIST] Vault base: ${vaultBase}`);
    const latestVersion = await getLatestVersionPath(vaultBase);
    
    if (!latestVersion) {
      console.log(`[LIST] No versions found for ${vaultBase}`);
      return res.json([]);
    }

    console.log(`[LIST] Listing from: ${latestVersion}`);
    const files = await sftpClient.list(latestVersion);
    res.json(files);
  } catch (error) {
    console.error(`[LIST] Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Descargar archivo (de la versión más reciente)
app.post('/download', async (req, res) => {
  try {
    if (!sftpClient) {
      return res.status(400).json({ error: 'Not connected' });
    }

    const filePath = req.body.path;
    console.log(`[DOWNLOAD] Original path: ${filePath}`);
    
    const pathParts = filePath.split('/').filter(p => p);
    let vaultBase = '';
    let relativePathParts = [];
    
    const obsidianIndex = pathParts.indexOf('obsidian');
    if (obsidianIndex !== -1 && obsidianIndex + 1 < pathParts.length) {
      vaultBase = '/' + pathParts.slice(0, obsidianIndex + 2).join('/');
      relativePathParts = pathParts.slice(obsidianIndex + 2);
    } else {
      vaultBase = '/' + pathParts[0];
      relativePathParts = pathParts.slice(1);
    }
    
    const relativePath = relativePathParts.join('/');
    console.log(`[DOWNLOAD] Vault base: ${vaultBase}, relative: ${relativePath}`);
    const latestVersion = await getLatestVersionPath(vaultBase);
    
    if (!latestVersion) {
      return res.status(404).json({ error: 'No versions found for vault' });
    }

    const versionedPath = `${latestVersion}/${relativePath}`;
    console.log(`[DOWNLOAD] Downloading from: ${versionedPath}`);
    
    const content = await sftpClient.get(versionedPath);
    const text = content.toString('utf8');
    res.json({ content: text });
  } catch (error) {
    console.error(`[DOWNLOAD] Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Subir archivo (con versionado)
app.post('/upload', async (req, res) => {
  try {
    if (!sftpClient) {
      return res.status(400).json({ error: 'Not connected' });
    }

    const filePath = req.body.path;
    const sessionId = req.body.sessionId;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }
    
    console.log(`[UPLOAD] Original path: ${filePath}`);
    console.log(`[UPLOAD] Session ID: ${sessionId}`);
    
    const pathParts = filePath.split('/').filter(p => p);
    let vaultBase = '';
    let relativePathParts = [];
    
    const obsidianIndex = pathParts.indexOf('obsidian');
    if (obsidianIndex !== -1 && obsidianIndex + 1 < pathParts.length) {
      vaultBase = '/' + pathParts.slice(0, obsidianIndex + 2).join('/');
      relativePathParts = pathParts.slice(obsidianIndex + 2);
    } else {
      vaultBase = '/' + pathParts[0];
      relativePathParts = pathParts.slice(1);
    }
    
    const relativePath = relativePathParts.join('/');
    console.log(`[UPLOAD] Vault base: ${vaultBase}, relative: ${relativePath}`);
    
    // Create versioned path: vault_base/sessionId/relative_path
    const versionedPath = `${vaultBase}/${sessionId}/${relativePath}`;
    console.log(`[UPLOAD] Versioned path: ${versionedPath}`);
    
    // Ensure directory exists
    const dirPath = versionedPath.substring(0, versionedPath.lastIndexOf('/'));
    console.log(`[UPLOAD] Creating directory: ${dirPath}`);
    try {
      await sftpClient.list(dirPath);
      console.log(`[UPLOAD] Directory exists`);
    } catch (e) {
      // Directory doesn't exist, create it recursively
      console.log(`[UPLOAD] Creating directory recursively...`);
      const dirs = dirPath.split('/');
      let currentPath = '';
      for (const dir of dirs) {
        if (!dir) continue; // Skip empty parts
        currentPath += '/' + dir;
        try {
          await sftpClient.list(currentPath);
        } catch (err) {
          console.log(`[UPLOAD] Creating: ${currentPath}`);
          await sftpClient.mkdir(currentPath);
        }
      }
    }

    const buffer = Buffer.from(req.body.content, 'utf8');
    await sftpClient.put(buffer, versionedPath);
    
    console.log(`[UPLOAD] Success: ${versionedPath}`);
    res.json({ message: 'Uploaded', path: versionedPath, version: sessionId });
  } catch (error) {
    console.error(`[UPLOAD] Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Crear directorio
app.post('/mkdir', async (req, res) => {
  try {
    if (!sftpClient) {
      return res.status(400).json({ error: 'Not connected' });
    }

    await sftpClient.mkdir(req.body.path);
    res.json({ message: 'Directory created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar directorio
app.post('/rmdir', async (req, res) => {
  try {
    if (!sftpClient) {
      return res.status(400).json({ error: 'Not connected' });
    }

    await sftpClient.rmdir(req.body.path);
    res.json({ message: 'Directory removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar archivo
app.post('/delete', async (req, res) => {
  try {
    if (!sftpClient) {
      return res.status(400).json({ error: 'Not connected' });
    }

    await sftpClient.delete(req.body.path);
    res.json({ message: 'File deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Comprobar si existe (busca en la versión más reciente)
app.post('/exists', async (req, res) => {
  try {
    if (!sftpClient) {
      return res.status(400).json({ error: 'Not connected' });
    }

    const requestPath = req.body.path;
    console.log(`[EXISTS] Checking: ${requestPath}`);
    
    const pathParts = requestPath.split('/').filter(p => p);
    let vaultBase = '';
    let relativePathParts = [];
    
    const obsidianIndex = pathParts.indexOf('obsidian');
    if (obsidianIndex !== -1 && obsidianIndex + 1 < pathParts.length) {
      vaultBase = '/' + pathParts.slice(0, obsidianIndex + 2).join('/');
      relativePathParts = pathParts.slice(obsidianIndex + 2);
    } else {
      vaultBase = '/' + pathParts[0];
      relativePathParts = pathParts.slice(1);
    }
    
    const relativePath = relativePathParts.join('/');
    console.log(`[EXISTS] Vault base: ${vaultBase}, relative: ${relativePath}`);
    
    // Check if vault has any versions
    if (!relativePath) {
      console.log(`[EXISTS] Checking vault existence: ${vaultBase}`);
      try {
        const list = await sftpClient.list(vaultBase);
        const hasVersions = list.some(item => item.type === 'd');
        console.log(`[EXISTS] Vault has versions: ${hasVersions}`);
        res.json({ exists: hasVersions });
        return;
      } catch (e) {
        res.json({ exists: false });
        return;
      }
    }
    
    const latestVersion = await getLatestVersionPath(vaultBase);
    if (!latestVersion) {
      console.log(`[EXISTS] No versions found for ${vaultBase}`);
      res.json({ exists: false });
      return;
    }

    const versionedPath = `${latestVersion}/${relativePath}`;
    console.log(`[EXISTS] Checking: ${versionedPath}`);
    
    try {
      const list = await sftpClient.list(versionedPath);
      console.log(`[EXISTS] Found as directory`);
      res.json({ exists: true });
    } catch (listError) {
      try {
        const stat = await sftpClient.stat(versionedPath);
        console.log(`[EXISTS] Found as file`);
        res.json({ exists: true });
      } catch (statError) {
        console.log(`[EXISTS] Not found`);
        res.json({ exists: false });
      }
    }
  } catch (error) {
    console.error(`[EXISTS] Error:`, error.message);
    res.json({ exists: false });
  }
});

// Desconectar
app.post('/disconnect', async (req, res) => {
  try {
    if (sftpClient) {
      await sftpClient.end();
      sftpClient = null;
    }
    res.json({ message: 'Disconnected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
```

5. **Ejecuta el servidor:**
```bash
node server.js
```

El servidor debería estar disponible en `http://192.168.X.X:3000` desde tu red local.

## En Obsidian

En **Settings → SFTP Client Settings** configura:

- **Server URL:** `http://192.168.X.X:3000` (donde X.X es tu IP de la RPi)
- **Username/Password/etc:** Los credentials de tu servidor SFTP (que el servidor usará para conectarse)

### Sincronizar vaults entre dispositivos

**Importante:** Cuando descargas un vault desde el servidor a un dispositivo nuevo, Obsidian **reemplaza automáticamente** el ID local con el del servidor si descargas los archivos de `.obsidian/`. Esto hace que los dos vaults sean idénticos.

**Recomendación para primer uso en móvil:**
1. En móvil, crea un vault nuevo con el **mismo nombre exacto** que en PC
2. Configura el plugin con la IP del servidor
3. Haz clic en **Download** - esto descargará todos los archivos, incluyendo `.obsidian/`
4. El vault móvil adoptará automáticamente el mismo ID que el del servidor
5. Futuras descargas/uploads funcionarán perfectamente

**Si no funciona el download:**
- Verifica que el **nombre del vault es idéntico** (mayúsculas/minúsculas importan)
- Verifica que la **Vault Path** en settings es la misma en todos tus dispositivos
- Si aún no funciona, usa una app de SFTP para copiar manualmente el vault la primera vez

## Para acceso remoto (móvil con VPN)

Si quieres acceso desde fuera de la red:
1. Configura port forwarding en tu router (puerto 3000 → RPi:3000)
2. Usa un servicio como Cloudflare Tunnel o similar
3. O usa una VPN para acceder a tu red

---

Avísame si necesitas ayuda con el servidor en la RPi.
