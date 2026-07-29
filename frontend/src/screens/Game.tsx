import { useEffect, useRef, useState } from "react";
import Button from "../components/Button";
import ChessBoard from "../components/ChessBoard";
import { useSocket } from "../hooks/useSocket";
import { Chess, PieceSymbol, Color } from "chess.js";
import { Square } from "chess.js";

export const INIT_GAME = "init_game";
export const MOVE = "move";
export const GAME_OVER = "game_over";
export const DRAW_OFFER = "draw_offer";
export const DRAW_ACCEPT = "draw_accept";
export const DRAW_DECLINE = "draw_decline";
export const TIME_UPDATE = "time_update";
export const RECONNECT_GAME = "RECONNECT_GAME";

const PIECE_UNICODE: Record<string, string> = {
  wq: "♕",
  wr: "♖",
  wb: "♗",
  wn: "♘",
  wp: "♙",
  bq: "♛",
  br: "♜",
  bb: "♝",
  bn: "♞",
  bp: "♟",
};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

// simple sound using Web Audio API
const playSound = (type: "move" | "capture" | "check" | "gameover") => {
  const ctx = new AudioContext();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g);
  g.connect(ctx.destination);
  const configs = {
    move: { freq: 440, duration: 0.1, gain: 0.3 },
    capture: { freq: 220, duration: 0.2, gain: 0.4 },
    check: { freq: 660, duration: 0.3, gain: 0.5 },
    gameover: { freq: 150, duration: 0.8, gain: 0.5 },
  };
  const { freq, duration, gain } = configs[type];
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  o.start(ctx.currentTime);
  o.stop(ctx.currentTime + duration);
};

const Game = () => {
  const socket = useSocket();
  const [chess] = useState(new Chess());
  const [board, setBoard] = useState(chess.board());
  const [started, setStarted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [color, setColor] = useState<"white" | "black">("white");
  const [winner, setWinner] = useState<"white" | "black" | "draw" | null>(null);
  const [turn, setTurn] = useState<"white" | "black">("white");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [capturedByWhite, setCapturedByWhite] = useState<
    { type: PieceSymbol; color: Color }[]
  >([]);
  const [capturedByBlack, setCapturedByBlack] = useState<
    { type: PieceSymbol; color: Color }[]
  >([]);
  const [player1Time, setPlayer1Time] = useState(10 * 60);
  const [player2Time, setPlayer2Time] = useState(10 * 60);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null,
  );
  const [drawOffered, setDrawOffered] = useState(false);
  const [drawDeclined, setDrawDeclined] = useState(false);
  const moveHistoryRef = useRef<HTMLDivElement>(null);
  const [opponent, setOpponent] = useState<{
    username: string;
    elo: number;
  } | null>(null);

  useEffect(() => {
    if (moveHistoryRef.current) {
      moveHistoryRef.current.scrollTop = moveHistoryRef.current.scrollHeight;
    }
  }, [moveHistory]);

  useEffect(() => {
    if (!socket) return;
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case INIT_GAME:
          chess.reset();
          setBoard(chess.board());
          setStarted(true);
          setWaiting(false);
          setWinner(null);
          setTurn("white");
          setMoveHistory([]);
          setCapturedByWhite([]);
          setCapturedByBlack([]);
          setLastMove(null);
          setDrawOffered(false);
          setPlayer1Time(message.payload.time);
          setPlayer2Time(message.payload.time);
          setColor(message.payload.color);
          setOpponent(message.payload.opponent);
          break;
        case MOVE: {
          const move = chess.move({
            ...message.payload,
            promotion: message.payload.promotion ?? "q",
          });
          setBoard(chess.board());
          setTurn(chess.turn() === "w" ? "white" : "black");
          setLastMove({ from: move.from as Square, to: move.to as Square });
          setMoveHistory((prev) => [...prev, move.san]);
          if (move.captured) {
            const captured = {
              type: move.captured,
              color: move.color === "w" ? "b" : ("w" as Color),
            };
            if (move.color === "w")
              setCapturedByWhite((prev) => [...prev, captured]);
            else setCapturedByBlack((prev) => [...prev, captured]);
            playSound(chess.inCheck() ? "check" : "capture");
          } else {
            playSound(chess.inCheck() ? "check" : "move");
          }
          break;
        }
        case GAME_OVER:
          setWinner(message.payload.winner);
          playSound("gameover");
          break;
        case TIME_UPDATE:
          setPlayer1Time(message.payload.player1Time);
          setPlayer2Time(message.payload.player2Time);
          break;
        case DRAW_OFFER:
          setDrawOffered(true);
          break;
        case DRAW_DECLINE:
          setDrawDeclined(true);
          setTimeout(() => setDrawDeclined(false), 3000);
          break;
        case RECONNECT_GAME: {
          const { color, fen, moves, player1Time, player2Time } =
            message.payload;
          chess.load(fen);
          setBoard(chess.board());
          setColor(color);
          setPlayer1Time(player1Time);
          setPlayer2Time(player2Time);
          setMoveHistory(moves.map((m: { san: string }) => m.san));
          setTurn(chess.turn() === "w" ? "white" : "black");
          setStarted(true);
          setWaiting(false);
          setWinner(null);
          setLastMove(null);
          break;
        }
      }
    };
  }, [socket]);

  if (!socket && !started)
    return (
      <h1 className="text-white flex justify-center pt-10">Connecting...</h1>
    );

  if (winner)
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="bg-slate-800 p-10 rounded-xl flex flex-col items-center gap-6">
          <h1 className="text-4xl font-bold text-white">
            {winner === "draw"
              ? "🤝 Draw!"
              : winner === color
                ? "🎉 You Won!"
                : "😞 You Lost!"}
          </h1>
          {winner !== "draw" && (
            <p className="text-slate-400 text-lg capitalize">
              {winner} wins the game
            </p>
          )}
          <Button
            onClick={() => {
              socket?.send(JSON.stringify({ type: INIT_GAME }));
              setStarted(false);
              setWinner(null);
              setWaiting(true);
            }}
          >
            Play Again
          </Button>
        </div>
      </div>
    );

  // draw offer received
  if (drawOffered)
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="bg-slate-800 p-10 rounded-xl flex flex-col items-center gap-6">
          <h1 className="text-2xl font-bold text-white">
            🤝 Opponent offers a draw
          </h1>
          <div className="flex gap-4">
            <Button
              onClick={() => {
                socket?.send(JSON.stringify({ type: DRAW_ACCEPT }));
                setDrawOffered(false);
              }}
            >
              Accept
            </Button>
            <Button
              onClick={() => {
                socket?.send(JSON.stringify({ type: DRAW_DECLINE }));
                setDrawOffered(false);
              }}
            >
              Decline
            </Button>
          </div>
        </div>
      </div>
    );

  const myTime = color === "white" ? player1Time : player2Time;
  const opponentTime = color === "white" ? player2Time : player1Time;

  return (
    <div className="flex justify-center">
      <div className="pt-8 max-w-screen-lg w-full">
        <div className="grid grid-cols-6 gap-4 w-full">
          <div className="col-span-4 w-full flex justify-center">
            <div className="flex flex-col gap-2">
              {/* opponent timer + captured */}
              <div className="flex justify-between items-center">
                <div className="flex flex-wrap gap-1">
                  {capturedByWhite.map((p, i) => (
                    <span key={i} className="text-lg">
                      {PIECE_UNICODE[`b${p.type}`]}
                    </span>
                  ))}
                </div>
                <span
                  className={`text-xl font-mono font-bold ${opponentTime < 30 ? "text-red-400" : "text-white"}`}
                >
                  {formatTime(opponentTime)}
                </span>
              </div>

              {socket && (
                <ChessBoard
                  socket={socket}
                  board={board}
                  myColor={color}
                  chess={chess}
                  lastMove={lastMove}
                />
              )}

              {/* my timer + captured */}
              <div className="flex justify-between items-center">
                <div className="flex flex-wrap gap-1">
                  {capturedByBlack.map((p, i) => (
                    <span key={i} className="text-lg">
                      {PIECE_UNICODE[`w${p.type}`]}
                    </span>
                  ))}
                </div>
                <span
                  className={`text-xl font-mono font-bold ${myTime < 30 ? "text-red-400" : "text-white"}`}
                >
                  {formatTime(myTime)}
                </span>
              </div>
            </div>
          </div>

          <div className="col-span-2 bg-slate-800 w-full flex flex-col items-center pt-8 gap-6 pb-8">
            {/* opponent info */}
            {opponent && (
              <div className="flex flex-col items-center gap-1">
                <p className="text-white font-bold">{opponent.username}</p>
                <p className="text-slate-400 text-sm">ELO: {opponent.elo}</p>
              </div>
            )}
            {/* turn indicator */}
            {started && (
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-full border-2 border-white ${turn === "white" ? "bg-white" : "bg-black"}`}
                />
                <p className="text-white capitalize">
                  {turn === color ? "Your turn" : "Opponent's turn"}
                </p>
              </div>
            )}

            {/* waiting */}
            {waiting && !started && (
              <p className="text-slate-400 text-sm animate-pulse">
                Waiting for opponent...
              </p>
            )}

            {/* play button */}
            {!started && !waiting && socket && (
              <Button
                onClick={() => {
                  socket.send(JSON.stringify({ type: INIT_GAME }));
                  setWaiting(true);
                }}
              >
                Play
              </Button>
            )}

            {/* draw declined notification */}
            {drawDeclined && (
              <p className="text-red-400 text-sm">Opponent declined the draw</p>
            )}

            {/* draw offer button */}
            {started && !drawDeclined && (
              <Button
                onClick={() =>
                  socket?.send(JSON.stringify({ type: DRAW_OFFER }))
                }
              >
                Offer Draw
              </Button>
            )}

            {/* move history */}
            {moveHistory.length > 0 && (
              <div className="w-full px-4">
                <p className="text-slate-400 text-sm mb-2">Move History</p>
                <div
                  ref={moveHistoryRef}
                  className="bg-slate-900 rounded-lg p-2 max-h-64 overflow-y-auto"
                >
                  {moveHistory
                    .reduce<string[][]>((pairs, move, i) => {
                      if (i % 2 === 0) pairs.push([move]);
                      else pairs[pairs.length - 1].push(move);
                      return pairs;
                    }, [])
                    .map((pair, i) => (
                      <div
                        key={i}
                        className="flex gap-2 text-sm py-1 border-b border-slate-700"
                      >
                        <span className="text-slate-500 w-6">{i + 1}.</span>
                        <span className="text-white w-12">{pair[0]}</span>
                        <span className="text-white w-12">{pair[1] ?? ""}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Game;
