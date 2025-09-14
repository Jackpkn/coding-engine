#!/usr/bin/env node

const http = require("http");
const { spawn } = require("child_process");

async function checkServer() {
  console.log("🔍 Checking Verilog API Server Status...\n");

  // Check if server is running
  const isRunning = await testConnection();

  if (isRunning) {
    console.log("✅ Server is running and responding");
    console.log("🚀 Your chat extension should work perfectly!");
    console.log("\nTo test:");
    console.log("1. Open VS Code: code .");
    console.log("2. Press Ctrl+Shift+V to open chat");
    console.log('3. Try: "what does cpu_core do?"');
    return;
  }

  console.log("❌ Server is not running");
  console.log("🚀 Starting server...\n");

  // Start the server
  const serverProcess = spawn("npm", ["run", "server"], {
    stdio: "inherit",
    shell: true,
  });

  // Wait a bit for server to start
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Check again
  const isRunningNow = await testConnection();

  if (isRunningNow) {
    console.log("\n✅ Server started successfully!");
    console.log("🎉 Your chat extension is ready to use!");
  } else {
    console.log("\n❌ Failed to start server");
    console.log("Please run manually: npm run server");
  }
}

async function testConnection() {
  return new Promise((resolve) => {
    const req = http.get("http://localhost:3000/health", (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          resolve(data.success === true);
        } catch (e) {
          resolve(false);
        }
      });
    });

    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

if (require.main === module) {
  checkServer().catch(console.error);
}
