import { Square, PieceSymbol, Color, Chess } from "chess.js";
import { useState } from "react";
import { MOVE } from "../screens/Game";

const PROMOTION_PIECES: PieceSymbol[] = ["q", "r", "b", "n"];

const ChessBoard = ({
  board, socket, myColor, chess, lastMove,
}: {
  board: ({ square: Square; type: PieceSymbol; color: Color } | null)[][];
  socket: WebSocket;
  myColor: "white" | "black";
  chess: Chess;
  lastMove: { from: Square; to: Square } | null;
}) => {
  const [from, setFrom] = useState<null | Square>(null);
  const [validMoves, setValidMoves] = useState<Square[]>([]);
  const [promotionMove, setPromotionMove] = useState<{ from: Square; to: Square } | null>(null);

  const displayBoard = myColor === "black" ? [...board].reverse() : board;

  const kingInCheckSquare = (): Square | null => {
    if (!chess.inCheck()) return null;
    const turn = chess.turn();
    for (const row of board)
      for (const square of row)
        if (square?.type === "k" && square?.color === turn) return square.square;
    return null;
  };

  const checkSquare = kingInCheckSquare();

  const isPromotion = (fromSquare: Square, toSquare: Square): boolean => {
    const piece = chess.get(fromSquare);
    if (!piece || piece.type !== "p") return false;
    const toRank = toSquare[1];
    return (piece.color === "w" && toRank === "8") || (piece.color === "b" && toRank === "1");
  };

  const handleSquareClick = (squareRep: Square, square: typeof board[0][0]) => {
    if (!from) {
      if (!square) return;
      setFrom(squareRep);
      setValidMoves(chess.moves({ square: squareRep, verbose: true }).map((m) => m.to as Square));
    } else {
      handleMove(from, squareRep);
      setValidMoves([]);
    }
  };

  const handleMove = (fromSquare: Square, toSquare: Square) => {
    if (isPromotion(fromSquare, toSquare)) {
      setPromotionMove({ from: fromSquare, to: toSquare });
      setFrom(null);
      setValidMoves([]);
      return;
    }
    socket.send(JSON.stringify({ type: MOVE, payload: { move: { from: fromSquare, to: toSquare } } }));
    setFrom(null);
    setValidMoves([]);
  };

  const handlePromotion = (piece: PieceSymbol) => {
    if (!promotionMove) return;
    socket.send(JSON.stringify({ type: MOVE, payload: { move: { from: promotionMove.from, to: promotionMove.to, promotion: piece } } }));
    setPromotionMove(null);
  };

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = myColor === "black" ? ["1","2","3","4","5","6","7","8"] : ["8","7","6","5","4","3","2","1"];

  const getSquareColor = (i: number, j: number, squareRep: Square) => {
    if (squareRep === checkSquare) return "bg-red-500";
    if (squareRep === from) return "bg-yellow-400";
    if (lastMove && (squareRep === lastMove.from || squareRep === lastMove.to)) return (i + j) % 2 === 0 ? "bg-yellow-300" : "bg-yellow-200";
    return (i + j) % 2 === 0 ? "bg-green-500" : "bg-white";
  };

  return (
    <div className="relative">
      {promotionMove && (
        <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center z-10">
          <div className="bg-slate-800 p-4 rounded-xl flex flex-col items-center gap-4">
            <p className="text-white font-bold text-lg">Choose promotion piece</p>
            <div className="flex gap-3">
              {PROMOTION_PIECES.map((piece) => (
                <div key={piece} onClick={() => handlePromotion(piece)}
                  className="w-16 h-16 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center cursor-pointer">
                  <img className="w-10 h-10" src={`/${myColor === "white" ? `${piece.toUpperCase()} copy` : piece}.png`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex">
        <div className="flex flex-col">
          {ranks.map((rank) => (
            <div key={rank} className="w-6 h-16 flex items-center justify-center text-slate-400 text-xs">{rank}</div>
          ))}
        </div>

        <div>
          <div>
            {displayBoard.map((row, i) => {
              const realI = myColor === "black" ? 7 - i : i;
              return (
                <div key={i} className="flex">
                  {row.map((square, j) => {
                    const squareRep = (String.fromCharCode(97 + j) + "" + (8 - realI)) as Square;
                    const isValidMove = validMoves.includes(squareRep);
                    return (
                      <div key={j}
                        className={`w-16 h-16 relative ${getSquareColor(i, j, squareRep)}`}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                        onDrop={(e) => { e.preventDefault(); if (from) { handleMove(from, squareRep); setValidMoves([]); } }}
                        onClick={() => handleSquareClick(squareRep, square)}
                      >
                        {isValidMove && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            {square
                              ? <div className="w-full h-full border-4 border-black opacity-20 bg-black" />
                              : <div className="w-4 h-4 rounded-full bg-black opacity-20" />}
                          </div>
                        )}
                        <div className="w-full flex justify-center h-full">
                          <div className="h-full flex flex-col justify-center">
                            {square ? (
                              <img
                                className="w-9 h-9 cursor-grab active:cursor-grabbing"
                                src={`/${square.color === "b" ? square.type : `${square.type.toUpperCase()} copy`}.png`}
                                draggable
                                onDragStart={(e) => {
                                  setFrom(squareRep);
                                  setValidMoves(chess.moves({ square: squareRep, verbose: true }).map((m) => m.to as Square));
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="flex">
            {files.map((file) => (
              <div key={file} className="w-16 flex items-center justify-center text-slate-400 text-xs">{file}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessBoard;
