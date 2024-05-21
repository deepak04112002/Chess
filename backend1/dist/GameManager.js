"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameManager = void 0;
const messages_1 = require("./messages");
const Game_1 = require("./Game");
class GameManager {
    constructor() {
        this.games = [];
        this.pendingUser = null;
        this.users = [];
    }
    //user added and pushed into the socket(connection)
    addUser(socket) {
        this.users.push(socket);
        //then sent to add handler
        this.addHandler(socket);
    }
    removeUser(socket) {
        this.users = this.users.filter((user) => user != socket);
    }
    addHandler(socket) {
        socket.on("message", (data) => {
            const message = JSON.parse(data.toString());
            //if message type is to start the game then it goes
            if (message.type === messages_1.INIT_GAME) {
                //if already one person is the game then this user get into the game
                if (this.pendingUser) {
                    const game = new Game_1.Game(this.pendingUser, socket);
                    this.games.push(game);
                    this.pendingUser = null;
                }
                //else new socket formed and the person is in pending state
                else {
                    this.pendingUser = socket;
                }
            }
            //if the message type is move then  the chess movement occur
            if (message.type === messages_1.MOVE) {
                //check if the players are in the socket and make the moves
                const game = this.games.find((game) => game.player1 === socket || game.player2 === socket);
                if (game) {
                    game.makeMove(socket, message.payload.move);
                }
            }
        });
    }
}
exports.GameManager = GameManager;
