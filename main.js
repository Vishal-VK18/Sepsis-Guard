const { app, BrowserWindow } = require('electron');

let mainWindow;

function createWindow() {
  // Create native desktop window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'SepsisGuard — Local Ward Monitoring System',
    autoHideMenuBar: true, // Removes default file/edit menu bar for a cleaner look
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load the running local Flask server URL
  mainWindow.loadURL('http://127.0.0.1:5000');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// Launch window when Electron initialization completes
app.whenReady().then(createWindow);

// Quit app when all windows are closed
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});