import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import { GameManager } from "./GameManager";
import { verifyToken } from "./auth";
import http from "http";
import { logger } from "./logger";

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/me" && req.method === "GET") {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) { res.writeHead(401); res.end(); return; }

    const user = await verifyToken(token);
    if (!user) { res.writeHead(401); res.end(); return; }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(user));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(3001, () => {
  logger.info("HTTP server running on http://localhost:3001");
  logger.info("WebSocket server running on ws://localhost:3001");
});


const wss = new WebSocketServer({ server });
const gameManager = new GameManager();

wss.on("connection", (ws: WebSocket) => {
  const authTimeout = setTimeout(() => ws.close(), 5000);

  ws.once("message", async (data) => {
    clearTimeout(authTimeout);

    try {
      const msg = JSON.parse(data.toString());
      if (msg.type !== "auth" || !msg.token) {
        ws.send(
          JSON.stringify({
            type: "error",
            payload: { message: "Invalid auth message" },
          }),
        );
        ws.close();
        return;
      }

      const user = await verifyToken(msg.token);
      if (!user) {
        ws.send(
          JSON.stringify({
            type: "error",
            payload: { message: "Invalid token" },
          }),
        );
        ws.close();
        return;
      }

      logger.info(`User connected: ${user.username}`);
      gameManager.addUser(ws, user);

      ws.on("close", async () => {
        logger.info(`User disconnected: ${user.username}`);
        await gameManager.removeUser(ws);
      });

      ws.on("error", (error) => {
        logger.error(`WebSocket error for ${user.username}: ${error}`);
      });
    } catch (error) {
      logger.error(`Connection error: ${error}`);
      ws.close();
    }
  });
});
