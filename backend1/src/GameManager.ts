import { WebSocket } from "ws";
import {
  DRAW_ACCEPT,
  DRAW_DECLINE,
  DRAW_OFFER,
  INIT_GAME,
  MOVE,
} from "./messages";
import { Game } from "./Game";
import { AuthUser } from "./auth";

export class GameManager {
  private games: Game[];
  private pendingUser: {
    socket: WebSocket;
    user: AuthUser;
  } | null;

  private users: Map<WebSocket, AuthUser>;
  private userToGame = new Map<string, Game>();

  constructor() {
    this.games = [];
    this.pendingUser = null;
    this.users = new Map();
  }

  addUser(socket: WebSocket, user: AuthUser) {
    this.users.set(socket, user);

    // Handle reconnections.
    const existingGame = this.userToGame.get(user.id);

    if (existingGame) {
      existingGame.reconnectPlayer(user.id, socket);

      this.addHandler(socket);
      return;
    }

    this.addHandler(socket);
  }

  async removeUser(socket: WebSocket) {
    const user = this.users.get(socket);

    this.users.delete(socket);

    // User was waiting in matchmaking.
    if (this.pendingUser?.socket === socket) {
      this.pendingUser = null;
      return;
    }

    if (!user) {
      return;
    }

    const game = this.userToGame.get(user.id);

    // Give the user time to reconnect.
    if (game) {
      await game.markDisconnected(user.id);
    }
  }

  getGameByUser(userId: string) {
    return this.userToGame.get(userId);
  }

  removeGame(game: Game) {
    this.userToGame.delete(game.player1User.id);

    this.userToGame.delete(game.player2User.id);

    this.games = this.games.filter((g) => g !== game);
  }

  private addHandler(socket: WebSocket) {
    socket.on("message", async (data) => {
      let message;

      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }

      // Matchmaking.
      if (message.type === INIT_GAME) {
        const user = this.users.get(socket);

        if (!user) {
          return;
        }

        if (this.pendingUser) {
          let game!: Game;

          game = new Game(
            this.pendingUser.socket,
            socket,
            this.pendingUser.user,
            user,
            () => this.removeGame(game),
          );

          this.games.push(game);

          this.userToGame.set(this.pendingUser.user.id, game);

          this.userToGame.set(user.id, game);

          this.pendingUser = null;
        } else {
          this.pendingUser = {
            socket,
            user,
          };
        }

        return;
      }

      // Handle moves.
      if (message.type === MOVE) {
        const user = this.users.get(socket);

        if (!user) {
          return;
        }

        const game = this.userToGame.get(user.id);

        if (game) {
          await game.makeMove(socket, message.payload.move);
        }

        return;
      }

      // Handle draw offers.
      if (message.type === DRAW_OFFER) {
        const user = this.users.get(socket);

        if (!user) {
          return;
        }

        const game = this.userToGame.get(user.id);

        if (game) {
          game.handleDrawOffer(socket);
        }

        return;
      }

      // Handle draw responses.
      if (message.type === DRAW_ACCEPT || message.type === DRAW_DECLINE) {
        const user = this.users.get(socket);

        if (!user) {
          return;
        }

        const game = this.userToGame.get(user.id);

        if (game) {
          await game.handleDrawResponse(socket, message.type === DRAW_ACCEPT);
        }
      }
    });
  }
}
