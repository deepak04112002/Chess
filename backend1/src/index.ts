import { WebSocketServer } from "ws";
import { GameManager } from "./GameManager";

const wss = new WebSocketServer({ port: 8080 });

//socket created and game started
const gameManager=new GameManager();

wss.on("connection", function connection(ws) {
  //user added
  gameManager.addUser(ws);
  //user removed
  ws.on("disconnect",()=>gameManager.removeUser(ws))
});
