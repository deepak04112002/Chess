import { WebSocket } from "ws";
import { Chess } from "chess.js";
import {
  DRAW_DECLINE,
  DRAW_OFFER,
  GAME_OVER,
  INIT_GAME,
  MOVE,
  TIME_UPDATE,
  RECONNECT_GAME,
} from "./messages";
import { AuthUser } from "./auth";
import { prisma } from "./db";
import { GameResult, Prisma } from "../generated/prisma";
import { logger } from "./logger";

const INITIAL_TIME = 10 * 60;

export class Game {
  public player1: WebSocket;
  public player2: WebSocket;
  public player1User: AuthUser;
  public player2User: AuthUser;
  public board: Chess;

  private startTime: Date;
  private moveCount = 0;
  private player1Time = INITIAL_TIME;
  private player2Time = INITIAL_TIME;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private drawOfferedBy: WebSocket | null = null;
  private gameEnded = false;
  private disconnectedUsers = new Set<string>();
  private disconnectTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private lastMoveTime = 0;

  private moves: { san: string; moveNumber: number }[] = [];

  constructor(
    player1: WebSocket,
    player2: WebSocket,
    player1User: AuthUser,
    player2User: AuthUser,
    private onGameEnd?: () => void,
  ) {
    this.player1 = player1;
    this.player2 = player2;
    this.player1User = player1User;
    this.player2User = player2User;
    this.board = new Chess();
    this.startTime = new Date();

    this.player1.send(
      JSON.stringify({
        type: INIT_GAME,
        payload: {
          color: "white",
          time: INITIAL_TIME,
          opponent: {
            username: player2User.username,
            elo: player2User.elo,
          },
        },
      }),
    );

    this.player2.send(
      JSON.stringify({
        type: INIT_GAME,
        payload: {
          color: "black",
          time: INITIAL_TIME,
          opponent: {
            username: player1User.username,
            elo: player1User.elo,
          },
        },
      }),
    );

    this.startTimer();
  }

  private startTimer() {
    this.timerInterval = setInterval(async () => {
      if (this.moveCount % 2 === 0) {
        this.player1Time--;
      } else {
        this.player2Time--;
      }

      const payload = JSON.stringify({
        type: TIME_UPDATE,
        payload: {
          player1Time: this.player1Time,
          player2Time: this.player2Time,
        },
      });

      if (this.player1.readyState === WebSocket.OPEN) {
        this.player1.send(payload);
      }

      if (this.player2.readyState === WebSocket.OPEN) {
        this.player2.send(payload);
      }

      if (this.player1Time <= 0) {
        await this.endGame("black");
      } else if (this.player2Time <= 0) {
        await this.endGame("white");
      }
    }, 1000);
  }

  private async endGame(winner: GameResult) {
    if (this.gameEnded) {
      return;
    }

    this.gameEnded = true;

    this.drawOfferedBy = null;

    for (const timeout of this.disconnectTimeouts.values()) {
      clearTimeout(timeout);
    }

    this.disconnectTimeouts.clear();
    this.disconnectedUsers.clear();

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    await this.updateGameResult(winner);

    if (this.onGameEnd) {
      this.onGameEnd();
    }

    const payload = JSON.stringify({
      type: GAME_OVER,
      payload: {
        winner,
      },
    });

    if (this.player1.readyState === WebSocket.OPEN) {
      this.player1.send(payload);
    }

    if (this.player2.readyState === WebSocket.OPEN) {
      this.player2.send(payload);
    }
  }

  private async updateGameResult(winner: GameResult) {
    const p1Won = winner === GameResult.white;
    const p2Won = winner === GameResult.black;
    const isDraw = winner === GameResult.draw;

    const whiteEloChange = p1Won ? 10 : p2Won ? -10 : 0;
    const blackEloChange = p2Won ? 10 : p1Won ? -10 : 0;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: {
          id: this.player1User.id,
        },
        data: {
          wins: p1Won ? { increment: 1 } : undefined,
          losses: p2Won ? { increment: 1 } : undefined,
          draws: isDraw ? { increment: 1 } : undefined,
          elo: {
            increment: whiteEloChange,
          },
        },
      });

      await tx.user.update({
        where: {
          id: this.player2User.id,
        },
        data: {
          wins: p2Won ? { increment: 1 } : undefined,
          losses: p1Won ? { increment: 1 } : undefined,
          draws: isDraw ? { increment: 1 } : undefined,
          elo: {
            increment: blackEloChange,
          },
        },
      });

      const game = await tx.game.create({
        data: {
          whitePlayerId: this.player1User.id,
          blackPlayerId: this.player2User.id,
          winner,
          pgn: this.board.pgn(),
          eloChangeWhite: whiteEloChange,
          eloChangeBlack: blackEloChange,
          startedAt: this.startTime,
          endedAt: new Date(),
        },
      });

      if (this.moves.length > 0) {
        await tx.move.createMany({
          data: this.moves.map((move) => ({
            gameId: game.id,
            moveSan: move.san,
            moveNumber: move.moveNumber,
          })),
        });
      }
    });
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  async markDisconnected(userId: string) {
    if (this.gameEnded) {
      return;
    }

    if (this.disconnectedUsers.has(userId)) {
      return;
    }

    // clear pending draw offers
    this.drawOfferedBy = null;

    this.disconnectedUsers.add(userId);

    // pause the chess clock
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    const timeout = setTimeout(async () => {
      if (this.gameEnded) {
        return;
      }

      if (userId === this.player1User.id) {
        await this.endGame(GameResult.black);
      } else {
        await this.endGame(GameResult.white);
      }

      this.disconnectTimeouts.delete(userId);
    }, 30000);

    this.disconnectTimeouts.set(userId, timeout);
  }

  reconnectPlayer(userId: string, socket: WebSocket) {
    if (userId === this.player1User.id) {
      this.player1 = socket;
    } else {
      this.player2 = socket;
    }

    this.disconnectedUsers.delete(userId);

    const timeout = this.disconnectTimeouts.get(userId);

    if (timeout) {
      clearTimeout(timeout);

      this.disconnectTimeouts.delete(userId);
    }

    // resume the clock if both players are connected
    if (
      this.disconnectedUsers.size === 0 &&
      !this.timerInterval &&
      !this.gameEnded
    ) {
      this.startTimer();
    }

    socket.send(
      JSON.stringify({
        type: RECONNECT_GAME,
        payload: {
          color: userId === this.player1User.id ? "white" : "black",
          fen: this.board.fen(),
          moves: this.moves,
          player1Time: this.player1Time,
          player2Time: this.player2Time,
        },
      }),
    );
  }

  isPlayer(userId: string) {
    return userId === this.player1User.id || userId === this.player2User.id;
  }

  handleDrawOffer(socket: WebSocket) {
    this.drawOfferedBy = socket;

    const opponent = socket === this.player1 ? this.player2 : this.player1;

    if (opponent.readyState === WebSocket.OPEN) {
      opponent.send(
        JSON.stringify({
          type: DRAW_OFFER,
        }),
      );
    }
  }

  async handleDrawResponse(socket: WebSocket, accepted: boolean) {
    if (!this.drawOfferedBy || socket === this.drawOfferedBy) {
      return;
    }

    if (accepted) {
      await this.endGame(GameResult.draw);
    } else {
      if (this.drawOfferedBy.readyState === WebSocket.OPEN) {
        this.drawOfferedBy.send(
          JSON.stringify({
            type: DRAW_DECLINE,
          }),
        );
      }
    }

    this.drawOfferedBy = null;
  }

  async makeMove(
    socket: WebSocket,
    move: {
      from: string;
      to: string;
      promotion?: string;
    },
  ) {
    if (this.gameEnded) return;

    const now = Date.now();
    if (now - this.lastMoveTime < 50) return;
    this.lastMoveTime = now;

    if (
      this.disconnectedUsers.has(this.player1User.id) ||
      this.disconnectedUsers.has(this.player2User.id)
    ) {
      return;
    }

    if (this.moveCount % 2 === 0 && socket !== this.player1) {
      return;
    }

    if (this.moveCount % 2 === 1 && socket !== this.player2) {
      return;
    }

    try {
      const result = this.board.move(move);

      this.moves.push({
        san: result.san,
        moveNumber: this.moveCount + 1,
      });
    } catch (error) {
      logger.warn(`Invalid move attempted: ${error}`);
      return;
    }

    const payload = JSON.stringify({
      type: MOVE,
      payload: move,
    });

    if (this.player1.readyState === WebSocket.OPEN) {
      this.player1.send(payload);
    }

    if (this.player2.readyState === WebSocket.OPEN) {
      this.player2.send(payload);
    }

    this.moveCount++;

    if (this.board.isGameOver()) {
      if (this.board.isDraw()) {
        await this.endGame(GameResult.draw);
      } else {
        await this.endGame(this.board.turn() === "w" ? GameResult.black : GameResult.white);
      }
    }
  }
}
